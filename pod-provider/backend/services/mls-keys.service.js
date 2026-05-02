'use strict';

/**
 * MLS Key Package Service
 *
 * Manages RFC 9420 (MLS) KeyPackage lifecycle for local actors in support of the
 * ActivityPub E2EE MLS spec (https://swicg.github.io/activitypub-e2ee/mls.html).
 *
 * All cryptographic material is generated using ts-mls (MIT, RFC 9420 full
 * implementation).  Private keys are stored in the actor's own SPARQL named
 * graph — tenant-isolated within the shared pod-provider triplestore dataset.
 *
 * NOTE: For true end-to-end encryption the private keys must never leave the
 * client device.  Server-side key generation here enables federation protocol
 * compatibility testing and server-mediated workflows only.
 *
 * Actions:
 *   mls.keys.generate  ({ actorUri })               → { id, cipherSuite, publicBytes }
 *   mls.keys.list      ({ actorUri })               → [{ id, cipherSuite, publicBytes, createdAt }]
 *   mls.keys.getPrivate({ actorUri, keyPackageId }) → { initPrivateKey, hpkePrivateKey, signaturePrivateKey } | null
 *   mls.keys.consume   ({ actorUri, keyPackageId }) → void
 *   mls.keys.delete    ({ actorUri, keyPackageId }) → void
 */

const crypto = require('crypto');
const { getDatasetFromUri } = require('@semapps/ldp');
const { retryWithBackoff } = require('../utils/backoff');

const MLS_NS = 'https://purl.archive.org/socialweb/mls#';
const DCTERMS_NS = 'http://purl.org/dc/terms/';
const DEFAULT_CIPHERSUITE = 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519';

// UUID v4 — only accepted format for externally supplied keyPackageId
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRetryable(err) {
  const code = Number(err?.code);
  if (err?.name === 'TimeoutError') return true;
  if (Number.isFinite(code) && (code === 408 || code === 425 || code === 429 || code >= 500)) return true;
  return /timeout|temporar|unavailable|econn|socket/i.test(String(err?.message || ''));
}

// JSON.stringify handles all SPARQL-unsafe characters: backslash, quote, control chars
function sparqlStr(value) {
  return JSON.stringify(String(value));
}

function keyPackageGraph(actorUri) {
  return `${actorUri.replace(/\/$/, '')}/mls-key-packages`;
}

function keyPackageNodeUri(actorUri, id) {
  return `${actorUri.replace(/\/$/, '')}/mls-key-packages/${id}`;
}

function sweepQuery(cutoff) {
  return `
    PREFIX mls: <${MLS_NS}>
    PREFIX dcterms: <${DCTERMS_NS}>
    DELETE {
      GRAPH ?g { ?node ?p ?o }
    }
    WHERE {
      GRAPH ?g {
        ?node a mls:KeyPackage ;
          dcterms:created ?created ;
          ?p ?o .
        FILTER(?created < ${sparqlStr(cutoff)})
      }
    }
  `;
}

function readBinding(row, key) {
  const v = row?.[key];
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof v.value === 'string') return v.value;
  return null;
}

// Minimum pool size and TTL can be overridden per deployment
const DEFAULT_MIN_POOL_SIZE = 10;
const DEFAULT_TTL_DAYS = 28;
// Initial delay before first sweep (let triplestore settle)
const SWEEP_WARMUP_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

module.exports = {
  name: 'mls.keys',

  dependencies: ['triplestore', 'auth.account', 'activitypub.actor'],

  settings: {
    minPoolSize: (n => (n > 0 ? n : DEFAULT_MIN_POOL_SIZE))(Number(process.env.MLS_KEYPACKAGE_MIN_POOL)),
    ttlDays: (n => (n > 0 ? n : DEFAULT_TTL_DAYS))(Number(process.env.MLS_KEYPACKAGE_TTL_DAYS))
  },

  created() {
    // Module-level cache: ESM dynamic import is expensive; reuse across calls
    this._mlsModule = null;
    this._csImpl = null;
    this._sweepIntervalId = null;
    this._sweepTimeoutId = null;
  },

  async started() {
    try {
      await this.getCsImpl();
      this.logger.info('[mls.keys] ts-mls ciphersuite impl loaded');
    } catch (err) {
      // Non-fatal: will retry on first action call
      this.logger.warn('[mls.keys] ts-mls pre-load failed; will retry on demand', {
        error: err instanceof Error ? err.message : String(err)
      });
    }

    // Schedule daily TTL sweep. Warmup delay avoids triplestore races on boot.
    this._sweepTimeoutId = setTimeout(() => {
      this.runSweep();
      this._sweepIntervalId = setInterval(() => this.runSweep(), SWEEP_INTERVAL_MS);
    }, SWEEP_WARMUP_MS);
  },

  async stopped() {
    if (this._sweepTimeoutId) {
      clearTimeout(this._sweepTimeoutId);
      this._sweepTimeoutId = null;
    }
    if (this._sweepIntervalId) {
      clearInterval(this._sweepIntervalId);
      this._sweepIntervalId = null;
    }
  },

  methods: {
    getMlsModule() {
      // Store the promise itself so concurrent callers share a single import().
      if (!this._mlsModule) {
        this._mlsModule = import('ts-mls');
      }
      return this._mlsModule;
    },

    getCsImpl() {
      // Store the promise itself to prevent concurrent callers from racing.
      if (!this._csImpl) {
        this._csImpl = this.getMlsModule().then(({ getCiphersuiteFromName, getCiphersuiteImpl }) => {
          const csDesc = getCiphersuiteFromName(DEFAULT_CIPHERSUITE);
          return getCiphersuiteImpl(csDesc);
        });
      }
      return this._csImpl;
    },

    async triQuery(ctx, query, dataset) {
      return retryWithBackoff(() => ctx.call('triplestore.query', { query, dataset, webId: 'system' }), {
        maxRetries: 3,
        baseDelayMs: 60,
        maxDelayMs: 1200,
        retryIf: isRetryable
      });
    },

    async triUpdate(ctx, query, dataset) {
      return retryWithBackoff(() => ctx.call('triplestore.update', { query, dataset, webId: 'system' }), {
        maxRetries: 3,
        baseDelayMs: 60,
        maxDelayMs: 1200,
        retryIf: isRetryable
      });
    },

    requireActorUri(actorUri) {
      if (!actorUri || typeof actorUri !== 'string') {
        throw new Error('actorUri is required');
      }
      try {
        const parsed = new URL(actorUri);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
      } catch {
        throw new Error(`actorUri must be a valid http(s) URL: ${actorUri}`);
      }
    },

    requireKeyPackageId(keyPackageId) {
      if (!keyPackageId || typeof keyPackageId !== 'string') {
        throw new Error('keyPackageId is required');
      }
      if (!UUID_V4_RE.test(keyPackageId)) {
        throw new Error('keyPackageId must be a valid UUID v4');
      }
    },

    async runSweep() {
      try {
        const ttlDays = this.settings.ttlDays || DEFAULT_TTL_DAYS;
        const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();
        await retryWithBackoff(
          () =>
            this.broker.call('triplestore.update', {
              query: sweepQuery(cutoff),
              dataset: 'users',
              webId: 'system'
            }),
          { maxRetries: 3, baseDelayMs: 60, maxDelayMs: 1200, retryIf: isRetryable }
        );
        this.logger.info('[mls.keys] TTL sweep completed', { ttlDays, cutoff });
      } catch (err) {
        this.logger.warn('[mls.keys] TTL sweep failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  },

  actions: {
    /**
     * Generate a new RFC 9420 KeyPackage for the actor.
     * Stores public + private key material in the actor's named graph.
     * Returns only public data.
     */
    async generate(ctx) {
      const { actorUri } = ctx.params;
      this.requireActorUri(actorUri);

      const { generateKeyPackage, defaultCapabilities, defaultLifetime, encodeMlsMessage } = await this.getMlsModule();
      const cs = await this.getCsImpl();

      // Basic credential: actor URI encoded as identity bytes per MLS spec
      const credential = {
        credentialType: 'basic',
        identity: Buffer.from(actorUri)
      };

      const kp = await generateKeyPackage(credential, defaultCapabilities(), defaultLifetime, [], cs);

      // Wrap in MLSMessage envelope (mls_key_package wireformat, RFC 9420 §6)
      const mlsMsg = { version: 'mls10', wireformat: 'mls_key_package', keyPackage: kp.publicPackage };
      const publicBytes = Buffer.from(encodeMlsMessage(mlsMsg)).toString('base64');

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const dataset = getDatasetFromUri(actorUri);
      const graph = keyPackageGraph(actorUri);
      const nodeUri = keyPackageNodeUri(actorUri, id);

      const initPrivKey = Buffer.from(kp.privatePackage.initPrivateKey).toString('base64');
      const hpkePrivKey = Buffer.from(kp.privatePackage.hpkePrivateKey).toString('base64');
      const sigPrivKey = Buffer.from(kp.privatePackage.signaturePrivateKey).toString('base64');

      await this.triUpdate(
        ctx,
        `
        PREFIX mls: <${MLS_NS}>
        PREFIX dcterms: <${DCTERMS_NS}>
        INSERT DATA {
          GRAPH <${graph}> {
            <${nodeUri}>
              a mls:KeyPackage ;
              mls:keyPackageId ${sparqlStr(id)} ;
              mls:cipherSuite ${sparqlStr(DEFAULT_CIPHERSUITE)} ;
              mls:publicBytes ${sparqlStr(publicBytes)} ;
              mls:initPrivateKey ${sparqlStr(initPrivKey)} ;
              mls:hpkePrivateKey ${sparqlStr(hpkePrivKey)} ;
              mls:signaturePrivateKey ${sparqlStr(sigPrivKey)} ;
              mls:status "active" ;
              dcterms:created ${sparqlStr(now)} .
          }
        }
      `,
        dataset
      );

      this.logger.debug('[mls.keys] key package generated', { actorUri, id });
      return { id, cipherSuite: DEFAULT_CIPHERSUITE, publicBytes };
    },

    /**
     * Store a client-submitted public KeyPackage (true E2EE: no server-side private key).
     * The actor generated this KeyPackage on their device; we store only the public bytes.
     */
    async submit(ctx) {
      const { actorUri, cipherSuite, publicBytes } = ctx.params;
      this.requireActorUri(actorUri);

      if (!cipherSuite || typeof cipherSuite !== 'string') {
        throw new Error('cipherSuite is required');
      }
      if (!publicBytes || typeof publicBytes !== 'string') {
        throw new Error('publicBytes is required');
      }
      // Validate base64 encoding
      if (!/^[A-Za-z0-9+/]+=*$/.test(publicBytes)) {
        throw new Error('publicBytes must be valid base64');
      }
      // Cap at 64 KiB (generous upper bound for an MLS KeyPackage)
      if (publicBytes.length > 87_382) {
        throw new Error('publicBytes exceeds maximum allowed size');
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const dataset = getDatasetFromUri(actorUri);
      const graph = keyPackageGraph(actorUri);
      const nodeUri = keyPackageNodeUri(actorUri, id);

      // Client-submitted packages have no private key fields
      await this.triUpdate(
        ctx,
        `
        PREFIX mls: <${MLS_NS}>
        PREFIX dcterms: <${DCTERMS_NS}>
        INSERT DATA {
          GRAPH <${graph}> {
            <${nodeUri}>
              a mls:KeyPackage ;
              mls:keyPackageId ${sparqlStr(id)} ;
              mls:cipherSuite ${sparqlStr(cipherSuite)} ;
              mls:publicBytes ${sparqlStr(publicBytes)} ;
              mls:status "active" ;
              mls:clientSubmitted "true" ;
              dcterms:created ${sparqlStr(now)} .
          }
        }
      `,
        dataset
      );

      this.logger.debug('[mls.keys] client key package submitted', { actorUri, id, cipherSuite });
      return { id, cipherSuite, publicBytes };
    },

    /**
     * List all active public KeyPackages for the actor.
     * Never returns private key material.
     */
    async list(ctx) {
      const { actorUri } = ctx.params;
      this.requireActorUri(actorUri);

      const dataset = getDatasetFromUri(actorUri);
      const graph = keyPackageGraph(actorUri);

      const rows = await this.triQuery(
        ctx,
        `
        PREFIX mls: <${MLS_NS}>
        PREFIX dcterms: <${DCTERMS_NS}>
        SELECT ?id ?cipherSuite ?publicBytes ?created WHERE {
          GRAPH <${graph}> {
            ?node a mls:KeyPackage ;
              mls:keyPackageId ?id ;
              mls:cipherSuite ?cipherSuite ;
              mls:publicBytes ?publicBytes ;
              mls:status "active" ;
              dcterms:created ?created .
          }
        }
        ORDER BY ?created
      `,
        dataset
      );

      return (Array.isArray(rows) ? rows : [])
        .map(row => ({
          id: readBinding(row, 'id'),
          cipherSuite: readBinding(row, 'cipherSuite'),
          publicBytes: readBinding(row, 'publicBytes'),
          createdAt: readBinding(row, 'created')
        }))
        .filter(item => item.id && item.publicBytes);
    },

    /**
     * Retrieve private key material for a specific KeyPackage.
     * Only callable from within the service mesh — no public API exposure.
     */
    async getPrivate(ctx) {
      const { actorUri, keyPackageId } = ctx.params;
      this.requireActorUri(actorUri);
      this.requireKeyPackageId(keyPackageId);

      const dataset = getDatasetFromUri(actorUri);
      const graph = keyPackageGraph(actorUri);
      const nodeUri = keyPackageNodeUri(actorUri, keyPackageId);

      const rows = await this.triQuery(
        ctx,
        `
        PREFIX mls: <${MLS_NS}>
        SELECT ?initPrivateKey ?hpkePrivateKey ?signaturePrivateKey WHERE {
          GRAPH <${graph}> {
            <${nodeUri}> a mls:KeyPackage ;
              mls:initPrivateKey ?initPrivateKey ;
              mls:hpkePrivateKey ?hpkePrivateKey ;
              mls:signaturePrivateKey ?signaturePrivateKey .
          }
        }
        LIMIT 1
      `,
        dataset
      );

      if (!Array.isArray(rows) || rows.length === 0) return null;
      const row = rows[0];
      return {
        initPrivateKey: readBinding(row, 'initPrivateKey'),
        hpkePrivateKey: readBinding(row, 'hpkePrivateKey'),
        signaturePrivateKey: readBinding(row, 'signaturePrivateKey')
      };
    },

    /**
     * Ensure an actor's active KeyPackage pool is at least minCount deep.
     * Generates as many packages as needed to reach the threshold in parallel.
     */
    async replenish(ctx) {
      const { actorUri } = ctx.params;
      this.requireActorUri(actorUri);
      const minCount =
        typeof ctx.params.minCount === 'number'
          ? ctx.params.minCount
          : this.settings.minPoolSize || DEFAULT_MIN_POOL_SIZE;

      const dataset = getDatasetFromUri(actorUri);
      const graph = keyPackageGraph(actorUri);

      const countRows = await this.triQuery(
        ctx,
        `
        PREFIX mls: <${MLS_NS}>
        SELECT (COUNT(?node) AS ?count) WHERE {
          GRAPH <${graph}> {
            ?node a mls:KeyPackage ;
              mls:status "active" .
          }
        }
      `,
        dataset
      );

      const currentCount =
        parseInt(readBinding(Array.isArray(countRows) && countRows[0] ? countRows[0] : null, 'count') ?? '0', 10) || 0;

      const needed = Math.max(0, minCount - currentCount);
      if (needed === 0) {
        this.logger.debug('[mls.keys] pool at capacity, no replenishment needed', {
          actorUri,
          currentCount,
          minCount
        });
        return { generated: 0, total: currentCount };
      }

      await Promise.all(Array.from({ length: needed }, () => ctx.call('mls.keys.generate', { actorUri })));

      this.logger.info('[mls.keys] pool replenished', {
        actorUri,
        generated: needed,
        total: currentCount + needed
      });
      return { generated: needed, total: currentCount + needed };
    },

    /**
     * Hard-delete all KeyPackages older than ttlDays across every actor.
     * Runs on a daily schedule; also callable on demand.
     */
    async sweepExpired(ctx) {
      const ttlDays =
        typeof ctx.params?.ttlDays === 'number' ? ctx.params.ttlDays : this.settings.ttlDays || DEFAULT_TTL_DAYS;
      const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();

      await retryWithBackoff(
        () => ctx.call('triplestore.update', { query: sweepQuery(cutoff), dataset: 'users', webId: 'system' }),
        { maxRetries: 3, baseDelayMs: 60, maxDelayMs: 1200, retryIf: isRetryable }
      );

      this.logger.info('[mls.keys] sweepExpired completed', { ttlDays, cutoff });
      return { ttlDays, cutoff };
    },

    /**
     * Mark a KeyPackage as consumed (used in a Welcome or Add proposal).
     * Record is retained for audit; package will not appear in the public collection.
     * Triggers async pool replenishment so the actor's pool stays healthy.
     */
    async consume(ctx) {
      const { actorUri, keyPackageId } = ctx.params;
      this.requireActorUri(actorUri);
      this.requireKeyPackageId(keyPackageId);

      const dataset = getDatasetFromUri(actorUri);
      const graph = keyPackageGraph(actorUri);
      const nodeUri = keyPackageNodeUri(actorUri, keyPackageId);

      await this.triUpdate(
        ctx,
        `
        PREFIX mls: <${MLS_NS}>
        WITH <${graph}>
        DELETE { <${nodeUri}> mls:status "active" }
        INSERT { <${nodeUri}> mls:status "consumed" }
        WHERE  { <${nodeUri}> a mls:KeyPackage ; mls:status "active" }
      `,
        dataset
      );

      this.logger.debug('[mls.keys] key package consumed', { actorUri, keyPackageId });

      // Fire-and-forget: replenish pool without blocking the consume response
      ctx
        .call('mls.keys.replenish', {
          actorUri,
          minCount: this.settings.minPoolSize || DEFAULT_MIN_POOL_SIZE
        })
        .catch(err => {
          this.logger.warn('[mls.keys] replenishment after consume failed', {
            actorUri,
            error: err instanceof Error ? err.message : String(err)
          });
        });
    },

    /**
     * Hard-delete a KeyPackage and all its triples from the named graph.
     */
    async delete(ctx) {
      const { actorUri, keyPackageId } = ctx.params;
      this.requireActorUri(actorUri);
      this.requireKeyPackageId(keyPackageId);

      const dataset = getDatasetFromUri(actorUri);
      const graph = keyPackageGraph(actorUri);
      const nodeUri = keyPackageNodeUri(actorUri, keyPackageId);

      await this.triUpdate(
        ctx,
        `
        PREFIX mls: <${MLS_NS}>
        WITH <${graph}>
        DELETE { <${nodeUri}> ?p ?o }
        WHERE  { <${nodeUri}> a mls:KeyPackage ; ?p ?o }
      `,
        dataset
      );

      this.logger.debug('[mls.keys] key package deleted', { actorUri, keyPackageId });
    }
  }
};
