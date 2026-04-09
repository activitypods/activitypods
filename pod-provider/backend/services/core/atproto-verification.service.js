const dns = require('node:dns').promises;
const fetch = require('node-fetch');
const { MoleculerError } = require('moleculer').Errors;

const TRANSIENT_NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT']);

module.exports = {
  name: 'atproto-verification',

  settings: {
    plcDirectoryUrl: process.env.ATPROTO_PLC_DIRECTORY_URL || 'https://plc.directory',
    requestTimeoutMs: Math.max(1_000, Math.min(Number(process.env.ATPROTO_VERIFICATION_TIMEOUT_MS) || 5_000, 15_000)),
    maxAttempts: Math.max(1, Math.min(Number(process.env.ATPROTO_VERIFICATION_MAX_ATTEMPTS) || 5, 5)),
    baseRetryDelayMs: Math.max(100, Math.min(Number(process.env.ATPROTO_VERIFICATION_BASE_DELAY_MS) || 250, 2_000)),
    maxResponseBytes: Math.max(
      8_192,
      Math.min(Number(process.env.ATPROTO_VERIFICATION_MAX_RESPONSE_BYTES) || 262_144, 1_048_576)
    ),
    allowHttpLocalhost: process.env.ATPROTO_VERIFICATION_ALLOW_HTTP_LOCALHOST === 'true'
  },

  actions: {
    verifyLinkableIdentity: {
      params: {
        pdsUrl: 'string|min:1',
        identifier: 'string|min:1',
        password: 'string|min:1',
        did: { type: 'string', optional: true },
        handle: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const claimedDid = ctx.params.did ? this.normalizeDid(ctx.params.did) : null;
        const claimedHandle = ctx.params.handle ? this.normalizeHandle(ctx.params.handle) : null;
        const pdsUrl = this.normalizePdsUrl(ctx.params.pdsUrl);
        const identifier = this.normalizeIdentifier(ctx.params.identifier);

        const session = await this.createSessionAgainstPds({
          identifier,
          password: String(ctx.params.password),
          pdsUrl
        });

        const did = this.normalizeDid(session.did);
        const handle = claimedHandle || this.normalizeHandle(session.handle);

        if (claimedDid && claimedDid !== did) {
          throw new MoleculerError('ATProto session DID mismatch', 400, 'ATPROTO_SESSION_DID_MISMATCH');
        }

        if (session.handle && claimedHandle && this.normalizeHandle(session.handle) !== claimedHandle) {
          throw new MoleculerError('ATProto session handle mismatch', 400, 'ATPROTO_SESSION_HANDLE_MISMATCH');
        }

        const resolvedHandleDid = await this.resolveHandleToDid(handle);
        if (resolvedHandleDid !== did) {
          throw new MoleculerError('ATProto handle does not resolve to DID', 400, 'ATPROTO_HANDLE_DID_MISMATCH');
        }

        const didDocument = await this.resolveDidDocument(did);
        this.assertDidDocumentClaimsHandle({ didDocument, did, handle });
        const signingKey = this.extractAtprotoSigningKey({ didDocument, did });
        const didDocumentPdsUrl = this.extractPdsEndpoint({ didDocument, did });

        if (didDocumentPdsUrl !== pdsUrl) {
          throw new MoleculerError(
            'PDS URL does not match DID document service endpoint',
            400,
            'ATPROTO_PDS_ENDPOINT_MISMATCH'
          );
        }

        return {
          did,
          handle,
          pdsUrl: didDocumentPdsUrl,
          resolvedHandleDid,
          didDocument,
          signingKey,
          session: {
            did,
            handle: session.handle ? this.normalizeHandle(session.handle) : handle
          }
        };
      }
    },

    verifyDelegatedIdentity: {
      params: {
        pdsUrl: 'string|min:1',
        accessToken: { type: 'string', min: 20, optional: true },
        subjectDid: { type: 'string', optional: true },
        did: { type: 'string', optional: true },
        handle: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const claimedDid = ctx.params.did ? this.normalizeDid(ctx.params.did) : null;
        const claimedHandle = ctx.params.handle ? this.normalizeHandle(ctx.params.handle) : null;
        const pdsUrl = this.normalizePdsUrl(ctx.params.pdsUrl);
        const subjectDid = ctx.params.subjectDid ? this.normalizeDid(ctx.params.subjectDid) : null;

        const session = subjectDid
          ? {
              did: subjectDid,
              handle: claimedHandle || null
            }
          : await this.getSessionFromAccessToken({
              pdsUrl,
              accessToken: String(ctx.params.accessToken || '').trim()
            });

        return this.buildVerifiedIdentityFromSession({
          session,
          pdsUrl,
          claimedDid,
          claimedHandle
        });
      }
    }
  },

  methods: {
    normalizeIdentifier(identifier) {
      const normalized = String(identifier || '').trim();
      if (!normalized) {
        throw new MoleculerError('Missing ATProto identifier', 400, 'ATPROTO_IDENTIFIER_INVALID');
      }
      return normalized;
    },

    normalizeDid(did) {
      const normalized = String(did || '').trim();
      if (!/^did:(plc|web):[A-Za-z0-9._:%-]+$/.test(normalized)) {
        throw new MoleculerError('Invalid ATProto DID', 400, 'ATPROTO_DID_INVALID');
      }
      return normalized;
    },

    normalizeHandle(handle) {
      const normalized = String(handle || '')
        .trim()
        .toLowerCase();
      if (
        !normalized ||
        normalized.length > 253 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(normalized)
      ) {
        throw new MoleculerError('Invalid ATProto handle', 400, 'ATPROTO_HANDLE_INVALID');
      }
      return normalized;
    },

    normalizePdsUrl(rawUrl) {
      let parsed;
      try {
        parsed = new URL(String(rawUrl || '').trim());
      } catch (_error) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_PDS_URL_INVALID');
      }

      if (parsed.username || parsed.password || parsed.hash || parsed.search) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_PDS_URL_INVALID');
      }

      const isLocalhost =
        parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';

      const schemeAllowed =
        parsed.protocol === 'https:' ||
        (this.settings.allowHttpLocalhost && isLocalhost && parsed.protocol === 'http:');

      if (!schemeAllowed) {
        throw new MoleculerError('PDS URL must use HTTPS', 400, 'ATPROTO_PDS_URL_INVALID');
      }

      return parsed.origin;
    },

    async createSessionAgainstPds({ identifier, password, pdsUrl }) {
      const response = await this.fetchJsonWithRetry(
        new URL('/xrpc/com.atproto.server.createSession', pdsUrl).toString(),
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            identifier,
            password
          })
        },
        {
          responseLabel: 'createSession',
          allowStatuses: [400, 401, 403]
        }
      );

      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new MoleculerError('External ATProto authentication failed', 401, 'ATPROTO_EXTERNAL_AUTH_FAILED');
      }

      const did = response.body?.did;
      const handle = response.body?.handle;

      if (typeof did !== 'string' || did.length === 0) {
        throw new MoleculerError(
          'External ATProto session response is missing DID',
          502,
          'ATPROTO_SESSION_RESPONSE_INVALID'
        );
      }

      if (handle !== undefined && (typeof handle !== 'string' || handle.length === 0)) {
        throw new MoleculerError(
          'External ATProto session response is missing handle',
          502,
          'ATPROTO_SESSION_RESPONSE_INVALID'
        );
      }

      return {
        did,
        handle: typeof handle === 'string' ? handle : null
      };
    },

    async getSessionFromAccessToken({ pdsUrl, accessToken }) {
      const response = await this.fetchJsonWithRetry(
        new URL('/xrpc/com.atproto.server.getSession', pdsUrl).toString(),
        {
          method: 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`
          }
        },
        {
          responseLabel: 'getSession',
          allowStatuses: [400, 401, 403]
        }
      );

      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new MoleculerError('External ATProto delegated token is invalid', 401, 'ATPROTO_EXTERNAL_AUTH_FAILED');
      }

      const did = response.body?.did;
      const handle = response.body?.handle;

      if (typeof did !== 'string' || did.length === 0) {
        throw new MoleculerError(
          'External ATProto delegated session response is missing DID',
          502,
          'ATPROTO_SESSION_RESPONSE_INVALID'
        );
      }

      if (handle !== undefined && (typeof handle !== 'string' || handle.length === 0)) {
        throw new MoleculerError(
          'External ATProto delegated session response is missing handle',
          502,
          'ATPROTO_SESSION_RESPONSE_INVALID'
        );
      }

      return {
        did,
        handle: typeof handle === 'string' ? handle : null
      };
    },

    async buildVerifiedIdentityFromSession({ session, pdsUrl, claimedDid, claimedHandle }) {
      const did = this.normalizeDid(session.did);
      let didDocument;
      let resolvedHandle = claimedHandle || (session.handle ? this.normalizeHandle(session.handle) : null);

      if (!resolvedHandle) {
        didDocument = await this.resolveDidDocument(did);
        resolvedHandle = this.extractHandleFromDidDocument({ didDocument, did });
      }

      const handle = resolvedHandle;

      if (claimedDid && claimedDid !== did) {
        throw new MoleculerError('ATProto session DID mismatch', 400, 'ATPROTO_SESSION_DID_MISMATCH');
      }

      if (session.handle && claimedHandle && this.normalizeHandle(session.handle) !== claimedHandle) {
        throw new MoleculerError('ATProto session handle mismatch', 400, 'ATPROTO_SESSION_HANDLE_MISMATCH');
      }

      const resolvedHandleDid = await this.resolveHandleToDid(handle);
      if (resolvedHandleDid !== did) {
        throw new MoleculerError('ATProto handle does not resolve to DID', 400, 'ATPROTO_HANDLE_DID_MISMATCH');
      }

      didDocument = didDocument || (await this.resolveDidDocument(did));
      this.assertDidDocumentClaimsHandle({ didDocument, did, handle });
      const signingKey = this.extractAtprotoSigningKey({ didDocument, did });
      const didDocumentPdsUrl = this.extractPdsEndpoint({ didDocument, did });

      if (didDocumentPdsUrl !== pdsUrl) {
        throw new MoleculerError(
          'PDS URL does not match DID document service endpoint',
          400,
          'ATPROTO_PDS_ENDPOINT_MISMATCH'
        );
      }

      return {
        did,
        handle,
        pdsUrl: didDocumentPdsUrl,
        resolvedHandleDid,
        didDocument,
        signingKey,
        session: {
          did,
          handle: session.handle ? this.normalizeHandle(session.handle) : handle
        }
      };
    },

    extractHandleFromDidDocument({ didDocument, did }) {
      const alsoKnownAs = Array.isArray(didDocument?.alsoKnownAs) ? didDocument.alsoKnownAs : [];
      const handleUri = alsoKnownAs.find(value => typeof value === 'string' && value.startsWith('at://'));

      if (!handleUri) {
        throw new MoleculerError(
          `Resolved DID document for ${did} does not advertise an ATProto handle`,
          400,
          'ATPROTO_HANDLE_NOT_CLAIMED'
        );
      }

      return this.normalizeHandle(handleUri.slice('at://'.length));
    },

    async resolveHandleToDid(handle) {
      const normalizedHandle = this.normalizeHandle(handle);

      const wellKnownDid = await this.resolveHandleViaWellKnown(normalizedHandle);
      if (wellKnownDid) {
        return wellKnownDid;
      }

      const dnsDid = await this.resolveHandleViaDns(normalizedHandle);
      if (dnsDid) {
        return dnsDid;
      }

      throw new MoleculerError(
        'ATProto handle could not be resolved to a DID',
        400,
        'ATPROTO_HANDLE_RESOLUTION_FAILED'
      );
    },

    async resolveHandleViaWellKnown(handle) {
      const response = await this.fetchTextWithRetry(
        this.buildWellKnownHandleUrl(handle),
        {
          method: 'GET',
          headers: {
            accept: 'text/plain, application/json;q=0.9'
          }
        },
        {
          responseLabel: 'handle-well-known',
          allowStatuses: [404]
        }
      );

      if (response.status === 404) {
        return null;
      }

      return this.normalizeDid(response.body.trim());
    },

    buildWellKnownHandleUrl(handle) {
      const isLocalhost = handle === 'localhost' || handle.endsWith('.localhost');
      const protocol = this.settings.allowHttpLocalhost && isLocalhost ? 'http:' : 'https:';
      return `${protocol}//${handle}/.well-known/atproto-did`;
    },

    async resolveHandleViaDns(handle) {
      const lookupName = `_atproto.${handle}`;
      const records = await this.withRetry('dns-resolve-txt', async () => {
        try {
          return await dns.resolveTxt(lookupName);
        } catch (error) {
          if (['ENODATA', 'ENOTFOUND', 'ESERVFAIL', 'ENOTIMP', 'EREFUSED', 'NOTFOUND'].includes(error?.code)) {
            return [];
          }
          throw error;
        }
      });

      const flattened = records.flat().map(value => String(value).trim());
      const match = flattened.find(value => value.toLowerCase().startsWith('did='));
      if (!match) return null;
      return this.normalizeDid(match.slice(4).trim());
    },

    async resolveDidDocument(did) {
      const normalizedDid = this.normalizeDid(did);
      const url = normalizedDid.startsWith('did:plc:')
        ? `${this.settings.plcDirectoryUrl.replace(/\/$/, '')}/${encodeURIComponent(normalizedDid)}`
        : this.didWebDocumentUrl(normalizedDid);

      const response = await this.fetchJsonWithRetry(
        url,
        {
          method: 'GET',
          headers: {
            accept: 'application/json'
          }
        },
        {
          responseLabel: 'did-document',
          allowStatuses: [404]
        }
      );

      if (response.status === 404) {
        throw new MoleculerError('ATProto DID document was not found', 404, 'ATPROTO_DID_DOCUMENT_NOT_FOUND');
      }

      const didDocument = this.normalizeDidDocument(response.body, normalizedDid);
      if (didDocument.id !== normalizedDid) {
        throw new MoleculerError('Resolved DID document does not match DID', 400, 'ATPROTO_DID_DOCUMENT_MISMATCH');
      }

      return didDocument;
    },

    didWebDocumentUrl(did) {
      const suffix = did.replace(/^did:web:/, '');
      const parts = suffix.split(':').map(part => decodeURIComponent(part));
      const hostname = parts.shift();
      if (!hostname) {
        throw new MoleculerError('Invalid did:web DID', 400, 'ATPROTO_DID_INVALID');
      }
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
      const protocol = this.settings.allowHttpLocalhost && isLocalhost ? 'http:' : 'https:';
      const path = parts.length === 0 ? '/.well-known/did.json' : `/${parts.join('/')}/did.json`;
      return `${protocol}//${hostname}${path}`;
    },

    normalizeDidDocument(payload, did) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new MoleculerError('Resolved DID document is invalid', 502, 'ATPROTO_DID_DOCUMENT_INVALID');
      }

      if (payload.id === did) {
        return payload;
      }

      if (payload.did === did && payload.service && payload.verificationMethod) {
        return {
          id: did,
          alsoKnownAs: Array.isArray(payload.alsoKnownAs) ? payload.alsoKnownAs : [],
          verificationMethod: payload.verificationMethod,
          service: payload.service
        };
      }

      throw new MoleculerError('Resolved DID document is invalid', 502, 'ATPROTO_DID_DOCUMENT_INVALID');
    },

    assertDidDocumentClaimsHandle({ didDocument, did, handle }) {
      if (didDocument.id !== did) {
        throw new MoleculerError('Resolved DID document does not match DID', 400, 'ATPROTO_DID_DOCUMENT_MISMATCH');
      }

      const alsoKnownAs = Array.isArray(didDocument.alsoKnownAs) ? didDocument.alsoKnownAs : [];
      const expected = `at://${handle}`;
      if (!alsoKnownAs.some(value => value === expected)) {
        throw new MoleculerError('DID document does not claim handle', 400, 'ATPROTO_HANDLE_NOT_CLAIMED');
      }
    },

    extractAtprotoSigningKey({ didDocument, did }) {
      const verificationMethods = Array.isArray(didDocument.verificationMethod) ? didDocument.verificationMethod : [];

      const match = verificationMethods.find(
        item =>
          item &&
          item.id === `${did}#atproto` &&
          item.controller === did &&
          item.type === 'Multikey' &&
          typeof item.publicKeyMultibase === 'string' &&
          item.publicKeyMultibase.length > 0
      );

      if (!match) {
        throw new MoleculerError('DID document missing valid ATProto signing key', 400, 'ATPROTO_SIGNING_KEY_MISSING');
      }

      return {
        id: match.id,
        type: match.type,
        publicKeyMultibase: match.publicKeyMultibase
      };
    },

    extractPdsEndpoint({ didDocument, did }) {
      const services = Array.isArray(didDocument.service) ? didDocument.service : [];
      const service = services.find(
        item =>
          item &&
          (item.id === `${did}#atproto_pds` || item.type === 'AtprotoPersonalDataServer') &&
          typeof item.serviceEndpoint === 'string'
      );

      if (!service) {
        throw new MoleculerError('DID document missing PDS service endpoint', 400, 'ATPROTO_PDS_SERVICE_MISSING');
      }

      return this.normalizePdsUrl(service.serviceEndpoint);
    },

    async fetchJsonWithRetry(url, init, options) {
      const response = await this.fetchWithRetry(url, init, options);
      let body;
      try {
        body = await response.json();
      } catch (_error) {
        throw new MoleculerError('Remote response was not valid JSON', 502, 'ATPROTO_REMOTE_RESPONSE_INVALID');
      }
      return {
        status: response.status,
        body
      };
    },

    async fetchTextWithRetry(url, init, options) {
      const response = await this.fetchWithRetry(url, init, options);
      const body = await response.text();
      return {
        status: response.status,
        body
      };
    },

    async fetchWithRetry(url, init, { responseLabel, allowStatuses = [] } = {}) {
      let lastError = null;

      for (let attempt = 1; attempt <= this.settings.maxAttempts; attempt += 1) {
        try {
          const response = await fetch(url, {
            ...init,
            redirect: 'error',
            timeout: this.settings.requestTimeoutMs,
            size: this.settings.maxResponseBytes
          });

          if (
            !response.ok &&
            !allowStatuses.includes(response.status) &&
            this.isRetryableStatus(response.status) &&
            attempt < this.settings.maxAttempts
          ) {
            await this.sleep(this.computeFullJitterDelay(attempt));
            continue;
          }

          if (!response.ok && !allowStatuses.includes(response.status) && response.status >= 500) {
            throw new MoleculerError(`${responseLabel || 'remote'} request failed`, 503, 'ATPROTO_REMOTE_UNAVAILABLE');
          }

          return response;
        } catch (error) {
          lastError = error;

          if (!this.isRetryableError(error) || attempt === this.settings.maxAttempts) {
            break;
          }

          await this.sleep(this.computeFullJitterDelay(attempt));
        }
      }

      if (lastError instanceof MoleculerError) {
        throw lastError;
      }

      throw new MoleculerError(`${responseLabel || 'remote'} request failed`, 503, 'ATPROTO_REMOTE_UNAVAILABLE');
    },

    isRetryableStatus(status) {
      return status === 408 || status === 425 || status === 429 || status >= 500;
    },

    isRetryableError(error) {
      if (!error) return false;
      if (error instanceof MoleculerError) {
        return error.code >= 500;
      }
      return TRANSIENT_NETWORK_CODES.has(String(error.code || ''));
    },

    computeFullJitterDelay(attempt) {
      const cap = Math.min(this.settings.baseRetryDelayMs * Math.pow(2, attempt - 1), 5_000);
      return Math.floor(Math.random() * cap);
    },

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }
};
