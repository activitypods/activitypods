/**
 * AT Protocol well-known publication endpoints.
 *
 * Two routes are served:
 *
 *   GET /.well-known/atproto-did
 *     Resolves a handle to a DID. The handle MUST be supplied via the
 *     HTTP `Host` header (per atproto handle resolution spec). This is
 *     the HTTPS path used by remote PDSes when they cannot use DNS TXT.
 *     See https://atproto.com/specs/handle#handle-resolution
 *
 *   GET /.well-known/did.json
 *     The SERVER-LEVEL did:web document for the PDS host. It declares
 *     the AT Protocol PDS service endpoint and the server's commit
 *     verification method (if a server-level rotation key is configured).
 *     This is NOT a per-user document — per-user DIDs use did:plc and
 *     are hosted by https://plc.directory. Per-user did:web is
 *     intentionally NOT supported (would require per-user subdomain DNS).
 *
 * Both endpoints are unauthenticated (public discovery), respond with
 * `Cache-Control: no-store` to avoid stale records during key rotation,
 * and never leak internal binding state — only the DID + canonical
 * service entries.
 */

const { MoleculerError } = require('moleculer').Errors;
const CONFIG = require('../../config/config');

// Mirrors the regex in atproto-provisioning.js / atproto-verification.service.js.
// Centralizing per-handle would require a shared util module — intentionally
// duplicated here (small constant) to avoid a cross-service dependency cycle.
const HANDLE_HOSTNAME_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
const HANDLE_MAX_LENGTH = 244;

const RESERVED_DEV_TLDS = new Set([
  'test',
  'localhost',
  'local',
  'invalid',
  'example',
  'internal',
  'alt',
  'arpa',
  'onion'
]);

module.exports = {
  name: 'atproto-well-known',

  dependencies: ['api', 'identitybindings'],

  settings: {
    // Server-level did:web document — only emitted when this hostname is
    // explicitly configured. Avoids accidentally publishing an empty doc
    // for every deployment.
    serverDidWebHost: process.env.APODS_ATPROTO_SERVER_DID_WEB_HOST || '',
    // Public XRPC endpoint advertised in the server did.json (must match
    // the sidecar's AT_PDS_HOSTNAME). When unset, falls back to
    // SEMAPPS_HOME_URL origin.
    serverPdsEndpoint: process.env.APODS_ATPROTO_LOCAL_PDS_BASE_URL || '',
    // Optional server-level commit/rotation public key in multibase form
    // (z<base58btc>). When provided, included as a verificationMethod in
    // the did.json doc. NOT the same as per-user keys.
    serverVerificationKeyMultibase: process.env.APODS_ATPROTO_SERVER_VERIFICATION_KEY_MULTIBASE || ''
  },

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'atproto-well-known-handle',
        path: '/.well-known/atproto-did',
        authentication: false,
        authorization: false,
        aliases: {
          'GET /': 'atproto-well-known.resolveHandle'
        }
      },
      toBottom: false
    });

    await this.broker.call('api.addRoute', {
      route: {
        name: 'atproto-well-known-did-web',
        path: '/.well-known/did.json',
        authentication: false,
        authorization: false,
        aliases: {
          'GET /': 'atproto-well-known.serverDidDocument'
        }
      },
      toBottom: false
    });

    this.logger.info(
      `[atproto-well-known] routes registered: GET /.well-known/atproto-did, GET /.well-known/did.json (serverDidWebHost=${this.settings.serverDidWebHost || '<unset>'})`
    );
  },

  actions: {
    /**
     * GET /.well-known/atproto-did
     *
     * Body is the DID as plain text (per spec — no JSON wrapping).
     * Returns 404 (NOT_FOUND) if the handle is unknown to this PDS, and
     * 400 if the Host header is malformed.
     */
    async resolveHandle(ctx) {
      const rawHost = this._extractHost(ctx);
      const handle = this._normalizeHandle(rawHost);

      // Refuse to resolve handles whose TLD is reserved-dev in production.
      // This prevents accidentally serving fake `.test` mappings to remote
      // verifiers. In dev, allowed.
      const tld = handle.split('.').pop();
      if (process.env.NODE_ENV === 'production' && RESERVED_DEV_TLDS.has(tld)) {
        throw new MoleculerError('Handle uses reserved dev TLD', 404, 'ATPROTO_HANDLE_RESERVED_TLD');
      }

      const projection = await ctx.call('internal-identity-projection.getByHandle', {
        atprotoHandle: handle
      });

      if (!projection || !projection.atprotoDid) {
        throw new MoleculerError('Handle not found', 404, 'NOT_FOUND', { handle });
      }

      // Per spec: response is plain text DID with no trailing newline,
      // Content-Type text/plain.
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      };

      return projection.atprotoDid;
    },

    /**
     * GET /.well-known/did.json
     *
     * Server-level did:web document. Disabled (404) unless
     * APODS_ATPROTO_SERVER_DID_WEB_HOST is configured.
     */
    async serverDidDocument(ctx) {
      const host = this.settings.serverDidWebHost.trim().toLowerCase();
      if (!host) {
        throw new MoleculerError('Server did:web is not configured', 404, 'NOT_FOUND');
      }

      this._assertServerHostValid(host);

      const did = `did:web:${host}`;
      const pdsEndpoint = this._resolveServerPdsEndpoint();

      const verificationMethod = [];
      if (this.settings.serverVerificationKeyMultibase) {
        verificationMethod.push({
          id: `${did}#atproto`,
          type: 'Multikey',
          controller: did,
          publicKeyMultibase: this.settings.serverVerificationKeyMultibase
        });
      }

      const doc = {
        '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
        id: did,
        alsoKnownAs: [],
        verificationMethod,
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: pdsEndpoint
          }
        ]
      };

      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Content-Type': 'application/did+json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      };

      return doc;
    }
  },

  methods: {
    /**
     * Extract the Host header from a Moleculer-Web request, stripping
     * port, normalizing case, and rejecting unsafe characters.
     */
    _extractHost(ctx) {
      const req = ctx.options?.parentCtx?.params?.req || ctx.params?.req || ctx.meta?.req;
      let host = ctx.meta?.host || ctx.meta?.headers?.host || (req && req.headers && req.headers.host) || '';
      host = String(host || '')
        .trim()
        .toLowerCase();
      // Strip :port — handle resolution is on hostname only.
      const colonIdx = host.indexOf(':');
      if (colonIdx >= 0) host = host.slice(0, colonIdx);
      return host;
    },

    _normalizeHandle(host) {
      if (!host) {
        throw new MoleculerError('Missing Host header', 400, 'BAD_REQUEST');
      }
      if (host.length > HANDLE_MAX_LENGTH) {
        throw new MoleculerError('Handle too long', 400, 'ATPROTO_HANDLE_TOO_LONG');
      }
      if (!HANDLE_HOSTNAME_RE.test(host)) {
        throw new MoleculerError('Handle does not match atproto syntax', 400, 'ATPROTO_HANDLE_INVALID_SYNTAX');
      }
      return host;
    },

    _resolveServerPdsEndpoint() {
      const override = this.settings.serverPdsEndpoint.trim();
      if (override) {
        try {
          const u = new URL(override);
          if (u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== '/')) {
            throw new Error('PDS endpoint must be origin-only');
          }
          return `${u.protocol}//${u.host}`;
        } catch (e) {
          throw new MoleculerError(
            `Invalid APODS_ATPROTO_LOCAL_PDS_BASE_URL: ${e.message}`,
            500,
            'ATPROTO_PDS_URL_INVALID'
          );
        }
      }
      try {
        const u = new URL(CONFIG.BASE_URL || 'http://localhost:3000');
        return `${u.protocol}//${u.host}`;
      } catch (_) {
        throw new MoleculerError('Cannot resolve PDS endpoint', 500, 'ATPROTO_PDS_URL_UNRESOLVED');
      }
    },

    _assertServerHostValid(host) {
      if (host.length > HANDLE_MAX_LENGTH) {
        throw new MoleculerError('Server host too long', 500, 'ATPROTO_SERVER_HOST_TOO_LONG');
      }
      if (!HANDLE_HOSTNAME_RE.test(host)) {
        throw new MoleculerError(
          'APODS_ATPROTO_SERVER_DID_WEB_HOST is not a valid hostname',
          500,
          'ATPROTO_SERVER_HOST_INVALID'
        );
      }
      if (process.env.NODE_ENV === 'production') {
        const tld = host.split('.').pop();
        if (RESERVED_DEV_TLDS.has(tld)) {
          throw new MoleculerError(
            `Server did:web host has reserved dev TLD ".${tld}" in production`,
            500,
            'ATPROTO_SERVER_HOST_RESERVED_TLD'
          );
        }
      }
    }
  }
};
