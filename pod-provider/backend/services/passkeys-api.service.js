const crypto = require('crypto');
const {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} = require('@simplewebauthn/server');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');
const { retryWithBackoff } = require('../utils/backoff');
const { Errors } = require('moleculer');
const CONFIG = require('../config/config');

const { MoleculerError } = Errors;

const APODS = 'http://activitypods.org/ns/core#';
const PASSKEY_TYPE = 'apods:PasskeyCredential';

module.exports = {
  name: 'passkeys-api',
  dependencies: ['api', 'auth.account', 'auth.jwt'],

  settings: {
    routePath: '/auth/passkeys',
    rpName: CONFIG.INSTANCE_NAME || 'ActivityPods',
    ticketTtlSec: 5 * 60,
    challengeTimeoutMs: 60 * 1000,
    userVerification: 'required'
  },

  async started() {
    const origin = this.getExpectedOrigin();
    const securityValidation = this.validateSecurityConfiguration(origin);

    if (!securityValidation.ok) {
      this.logger.error(`[Passkeys] Disabled: ${securityValidation.reason}`);
      await this.registerUnavailableRoute(origin, securityValidation.reason);
      return;
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'passkeys-api',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        onBeforeCall(ctx, route, req, res) {
          ctx.meta.$headers = req.headers;
          res.setHeader('Cache-Control', 'no-store');
        },
        aliases: {
          'POST /registration/options': 'passkeys-api.registrationOptions',
          'POST /registration/verify': 'passkeys-api.registrationVerify',
          'POST /authentication/options': 'passkeys-api.authenticationOptions',
          'POST /authentication/verify': 'passkeys-api.authenticationVerify',
          'GET /credentials': 'passkeys-api.listCredentials',
          'DELETE /credentials/:credentialId': 'passkeys-api.deleteCredential'
        },
        cors: {
          origin: [origin],
          methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
          credentials: false
        }
      },
      toBottom: false
    });

    this.logger.info(`[Passkeys] Routes registered under ${this.settings.routePath}`);
  },

  actions: {
    async registrationOptions(ctx) {
      const webId = await this.resolveAuthenticatedWebId(ctx, { required: true });
      const account = await ctx.call('auth.account.findByWebId', { webId });
      const credentials = await this.listCredentialsByWebId(ctx, webId);
      const options = await generateRegistrationOptions({
        rpName: this.settings.rpName,
        rpID: this.getRpId(),
        userID: this.userHandleForWebId(webId),
        userName: account?.username || webId,
        userDisplayName: account?.username || webId,
        timeout: this.settings.challengeTimeoutMs,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: this.settings.userVerification
        },
        excludeCredentials: credentials.map(credential => ({
          id: Buffer.from(credential.credentialId, 'base64url'),
          transports: credential.transports
        })),
        supportedAlgorithmIDs: [-8, -7, -257]
      });

      return {
        options,
        ticket: this.signTicket({
          kind: 'registration',
          challenge: options.challenge,
          webId
        })
      };
    },

    async registrationVerify(ctx) {
      const webId = await this.resolveAuthenticatedWebId(ctx, { required: true });
      const ticket = this.readTicket(ctx.params.ticket, 'registration');

      if (ticket.webId !== webId) {
        throw new MoleculerError('Passkey ticket does not match the authenticated user', 400, 'PASSKEY_TICKET_MISMATCH');
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: this.requireWebauthnResponse(ctx.params.response),
          expectedChallenge: ticket.challenge,
          expectedOrigin: this.getExpectedOrigin(),
          expectedRPID: this.getRpId(),
          requireUserVerification: true
        });
      } catch (_error) {
        throw new MoleculerError('Passkey registration could not be verified', 400, 'PASSKEY_REGISTRATION_FAILED');
      }

      if (!verification.verified || !verification.registrationInfo) {
        throw new MoleculerError('Passkey registration could not be verified', 400, 'PASSKEY_REGISTRATION_FAILED');
      }

      const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo;
      const record = await this.upsertCredential(ctx, {
        credentialId: credential.id,
        webId,
        userHandle: this.userHandleForWebId(webId).toString('base64url'),
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter || 0,
        transports: Array.isArray(credential.transports) ? credential.transports : [],
        deviceType: credentialDeviceType || null,
        backedUp: typeof credentialBackedUp === 'boolean' ? credentialBackedUp : null,
        lastUsedAt: null
      });

      ctx.meta.$statusCode = 201;
      return {
        ok: true,
        credentialId: record.credentialId,
        createdAt: record.createdAt
      };
    },

    async authenticationOptions(ctx) {
      const options = await generateAuthenticationOptions({
        rpID: this.getRpId(),
        timeout: this.settings.challengeTimeoutMs,
        userVerification: this.settings.userVerification
      });

      return {
        options,
        ticket: this.signTicket({
          kind: 'authentication',
          challenge: options.challenge
        })
      };
    },

    async authenticationVerify(ctx) {
      const ticket = this.readTicket(ctx.params.ticket, 'authentication');
      const credentialId = this.normalizeCredentialId(this.requireWebauthnResponse(ctx.params.response));
      const storedCredential = await this.getCredentialByCredentialId(ctx, credentialId);

      if (!storedCredential) {
        throw new MoleculerError('Passkey authentication failed', 401, 'PASSKEY_AUTHENTICATION_FAILED');
      }

      const responseUserHandle = ctx.params.response?.response?.userHandle;
      if (responseUserHandle && responseUserHandle !== storedCredential.userHandle) {
        throw new MoleculerError('Passkey authentication failed', 401, 'PASSKEY_AUTHENTICATION_FAILED');
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: this.requireWebauthnResponse(ctx.params.response),
          expectedChallenge: ticket.challenge,
          expectedOrigin: this.getExpectedOrigin(),
          expectedRPID: this.getRpId(),
          credential: {
            id: storedCredential.credentialId,
            publicKey: Buffer.from(storedCredential.publicKey, 'base64url'),
            counter: storedCredential.counter,
            transports: storedCredential.transports
          },
          requireUserVerification: true
        });
      } catch (_error) {
        throw new MoleculerError('Passkey authentication failed', 401, 'PASSKEY_AUTHENTICATION_FAILED');
      }

      if (!verification.verified || !verification.authenticationInfo) {
        throw new MoleculerError('Passkey authentication failed', 401, 'PASSKEY_AUTHENTICATION_FAILED');
      }

      await this.touchCredential(ctx, storedCredential.credentialId, {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date().toISOString()
      });

      const token = await ctx.call('auth.jwt.generateServerSignedToken', {
        payload: { webId: storedCredential.webId }
      });

      return {
        ok: true,
        token,
        webId: storedCredential.webId
      };
    },

    async listCredentials(ctx) {
      const webId = await this.resolveAuthenticatedWebId(ctx, { required: true });
      const credentials = await this.listCredentialsByWebId(ctx, webId);
      return credentials.map(credential => ({
        credentialId: credential.credentialId,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
        lastUsedAt: credential.lastUsedAt,
        transports: credential.transports,
        deviceType: credential.deviceType,
        backedUp: credential.backedUp
      }));
    },

    async deleteCredential(ctx) {
      const webId = await this.resolveAuthenticatedWebId(ctx, { required: true });
      const credentialId = String(ctx.params.credentialId || '').trim();
      const credential = await this.getCredentialByCredentialId(ctx, credentialId);

      if (!credential || credential.webId !== webId) {
        throw new MoleculerError('Passkey not found', 404, 'PASSKEY_NOT_FOUND');
      }

      await this.triplestoreUpdateWithBackoff(ctx, {
        query: sanitizeSparqlQuery`
          DELETE {
            <${this.credentialUri(credentialId)}> ?p ?o .
          }
          WHERE {
            OPTIONAL { <${this.credentialUri(credentialId)}> ?p ?o . }
          }
        `,
        dataset: 'settings',
        webId: 'system'
      });

      return { ok: true };
    },

    unavailable(ctx) {
      return this.buildUnavailableResponse(ctx);
    }
  },

  methods: {
    async registerUnavailableRoute(origin, reason) {
      await this.broker.call('api.addRoute', {
        route: {
          name: 'passkeys-api-unavailable',
          path: this.settings.routePath,
          authorization: false,
          authentication: false,
          bodyParsers: { json: { strict: false } },
          aliases: {
            'POST /registration/options': 'passkeys-api.unavailable',
            'POST /registration/verify': 'passkeys-api.unavailable',
            'POST /authentication/options': 'passkeys-api.unavailable',
            'POST /authentication/verify': 'passkeys-api.unavailable',
            'GET /credentials': 'passkeys-api.unavailable',
            'DELETE /credentials/:credentialId': 'passkeys-api.unavailable'
          },
          cors: {
            origin: [origin],
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            credentials: false
          }
        },
        toBottom: false
      });

      this.logger.warn(`[Passkeys] Unavailable route registered under ${this.settings.routePath}`);
      this.passkeysDisabledReason = reason;
    },

    getExpectedOrigin() {
      const configuredOrigin = process.env.WEBAUTHN_ORIGIN || CONFIG.FRONTEND_URL || CONFIG.BASE_URL;
      return String(configuredOrigin).replace(/\/$/, '');
    },

    validateSecurityConfiguration(origin) {
      let parsedOrigin;
      try {
        parsedOrigin = new URL(origin);
      } catch (_error) {
        return { ok: false, reason: 'invalid WEBAUTHN_ORIGIN/SEMAPPS_FRONTEND_URL configuration' };
      }

      const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(parsedOrigin.hostname);

      if (parsedOrigin.protocol !== 'https:' && !isLocalhost) {
        return { ok: false, reason: 'WEBAUTHN_ORIGIN must use https in non-local environments' };
      }

      const secret = this.ticketSecret();
      if (!secret || secret.length < 32) {
        return { ok: false, reason: 'WEBAUTHN_TICKET_SECRET/SEMAPPS_COOKIE_SECRET must be set and >= 32 characters' };
      }

      return { ok: true };
    },

    buildUnavailableResponse(ctx) {
      ctx.meta.$statusCode = 503;
      return {
        ok: false,
        code: 'PASSKEYS_DISABLED',
        message: this.passkeysDisabledReason || 'Passkeys are not configured for this server'
      };
    },

    getRpId() {
      if (process.env.WEBAUTHN_RP_ID) return String(process.env.WEBAUTHN_RP_ID).trim();
      return new URL(this.getExpectedOrigin()).hostname;
    },

    async resolveAuthenticatedWebId(ctx, { required = false } = {}) {
      const explicitWebId = ctx.meta?.webId;
      if (explicitWebId && explicitWebId !== 'anon') return explicitWebId;

      const token = this.readBearerToken(ctx);
      if (!token) {
        if (required) throw new MoleculerError('Authentication required', 401, 'AUTH_REQUIRED');
        return null;
      }

      let payload;
      try {
        payload = await ctx.call('auth.jwt.decodeToken', { token });
      } catch (_error) {
        throw new MoleculerError('Authentication required', 401, 'AUTH_REQUIRED');
      }

      const webId = typeof payload?.webId === 'string' && payload.webId.trim().length > 0 ? payload.webId : null;
      if (!webId && required) {
        throw new MoleculerError('Authentication required', 401, 'AUTH_REQUIRED');
      }
      return webId;
    },

    readBearerToken(ctx) {
      const authHeader = ctx.meta?.$headers?.authorization || ctx.meta?.$headers?.Authorization;
      if (!authHeader || typeof authHeader !== 'string') return null;
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      return match?.[1]?.trim() || null;
    },

    userHandleForWebId(webId) {
      return crypto.createHmac('sha256', this.ticketSecret()).update(String(webId)).digest().subarray(0, 32);
    },

    ticketSecret() {
      return process.env.WEBAUTHN_TICKET_SECRET || process.env.SEMAPPS_COOKIE_SECRET || CONFIG.COOKIE_SECRET;
    },

    signTicket(payload) {
      const body = Buffer.from(
        JSON.stringify({
          ...payload,
          exp: Date.now() + this.settings.ticketTtlSec * 1000,
          rpId: this.getRpId(),
          origin: this.getExpectedOrigin()
        }),
        'utf8'
      ).toString('base64url');
      const signature = crypto.createHmac('sha256', this.ticketSecret()).update(body).digest('base64url');
      return `${body}.${signature}`;
    },

    readTicket(ticket, expectedKind) {
      if (typeof ticket !== 'string' || !ticket.includes('.')) {
        throw new MoleculerError('Missing passkey ticket', 400, 'PASSKEY_TICKET_MISSING');
      }

      const [body, providedSignature] = ticket.split('.');
      const expectedSignature = crypto.createHmac('sha256', this.ticketSecret()).update(body).digest('base64url');
      const provided = Buffer.from(providedSignature, 'utf8');
      const expected = Buffer.from(expectedSignature, 'utf8');

      if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        throw new MoleculerError('Invalid passkey ticket', 400, 'PASSKEY_TICKET_INVALID');
      }

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (payload.kind !== expectedKind || payload.exp < Date.now()) {
        throw new MoleculerError('Expired passkey ticket', 400, 'PASSKEY_TICKET_EXPIRED');
      }
      if (payload.origin !== this.getExpectedOrigin() || payload.rpId !== this.getRpId()) {
        throw new MoleculerError('Passkey ticket origin mismatch', 400, 'PASSKEY_TICKET_ORIGIN_MISMATCH');
      }
      return payload;
    },

    credentialUri(credentialId) {
      const digest = crypto.createHash('sha256').update(String(credentialId)).digest('hex');
      return `${String(CONFIG.BASE_URL || this.getExpectedOrigin()).replace(/\/$/, '')}/_passkeys/${digest}`;
    },

    sparqlLiteral(value) {
      if (value === null || value === undefined) return null;
      return JSON.stringify(String(value));
    },

    normalizeCredentialId(response) {
      const credentialId = response?.id || response?.rawId;
      if (!credentialId || typeof credentialId !== 'string' || credentialId.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(credentialId)) {
        throw new MoleculerError('Missing credential ID', 400, 'PASSKEY_CREDENTIAL_ID_MISSING');
      }
      return credentialId;
    },

    requireWebauthnResponse(response) {
      if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw new MoleculerError('Invalid passkey response payload', 400, 'PASSKEY_INVALID_RESPONSE');
      }
      return response;
    },

    async upsertCredential(ctx, credential) {
      const now = new Date().toISOString();
      const existing = await this.getCredentialByCredentialId(ctx, credential.credentialId);
      const createdAt = existing?.createdAt || now;
      const record = {
        credentialId: credential.credentialId,
        webId: credential.webId,
        userHandle: credential.userHandle,
        publicKey: credential.publicKey,
        counter: Number(credential.counter || 0),
        transports: Array.isArray(credential.transports) ? credential.transports : [],
        deviceType: credential.deviceType || null,
        backedUp: typeof credential.backedUp === 'boolean' ? credential.backedUp : null,
        createdAt,
        updatedAt: now,
        lastUsedAt: credential.lastUsedAt || existing?.lastUsedAt || null
      };
      const triples = [
        `<${this.credentialUri(record.credentialId)}> a ${PASSKEY_TYPE} ;`,
        `  apods:credentialId ${this.sparqlLiteral(record.credentialId)} ;`,
        `  apods:webId ${this.sparqlLiteral(record.webId)} ;`,
        `  apods:userHandle ${this.sparqlLiteral(record.userHandle)} ;`,
        `  apods:publicKey ${this.sparqlLiteral(record.publicKey)} ;`,
        `  apods:counter ${this.sparqlLiteral(record.counter)} ;`,
        `  apods:transportsJson ${this.sparqlLiteral(JSON.stringify(record.transports))} ;`,
        `  apods:updatedAt ${this.sparqlLiteral(record.updatedAt)} ;`,
        `  apods:createdAt ${this.sparqlLiteral(record.createdAt)}`
      ];

      if (record.deviceType) triples.splice(triples.length - 1, 0, `  apods:deviceType ${this.sparqlLiteral(record.deviceType)} ;`);
      if (record.backedUp !== null) {
        triples.splice(triples.length - 1, 0, `  apods:backedUp ${this.sparqlLiteral(record.backedUp)} ;`);
      }
      if (record.lastUsedAt) {
        triples.splice(triples.length - 1, 0, `  apods:lastUsedAt ${this.sparqlLiteral(record.lastUsedAt)} ;`);
      }

      await this.triplestoreUpdateWithBackoff(ctx, {
        query: `
          PREFIX apods: <${APODS}>
          DELETE {
            <${this.credentialUri(record.credentialId)}> ?p ?o .
          }
          INSERT {
${triples.join('\n')}
.
          }
          WHERE {
            OPTIONAL { <${this.credentialUri(record.credentialId)}> ?p ?o . }
          }
        `,
        dataset: 'settings',
        webId: 'system'
      });

      return record;
    },

    async touchCredential(ctx, credentialId, updates) {
      const existing = await this.getCredentialByCredentialId(ctx, credentialId);
      if (!existing) return null;
      return this.upsertCredential(ctx, {
        ...existing,
        counter: Number.isFinite(Number(updates.counter)) ? Number(updates.counter) : existing.counter,
        lastUsedAt: updates.lastUsedAt || existing.lastUsedAt
      });
    },

    async getCredentialByCredentialId(ctx, credentialId) {
      const records = await this.queryCredentials(ctx, sanitizeSparqlQuery`
        ?credential a apods:PasskeyCredential .
        ?credential apods:credentialId ${this.sparqlLiteral(credentialId)} .
      `);
      return records[0] || null;
    },

    async listCredentialsByWebId(ctx, webId) {
      return this.queryCredentials(ctx, sanitizeSparqlQuery`
        ?credential a apods:PasskeyCredential .
        ?credential apods:webId ${this.sparqlLiteral(webId)} .
      `);
    },

    async queryCredentials(ctx, whereClause) {
      const rows = await this.triplestoreQueryWithBackoff(ctx, {
        query: `
          PREFIX apods: <${APODS}>
          SELECT ?credential ?credentialId ?webId ?userHandle ?publicKey ?counter ?transportsJson ?deviceType ?backedUp ?createdAt ?updatedAt ?lastUsedAt
          WHERE {
            ${whereClause}
            OPTIONAL { ?credential apods:credentialId ?credentialId . }
            OPTIONAL { ?credential apods:webId ?webId . }
            OPTIONAL { ?credential apods:userHandle ?userHandle . }
            OPTIONAL { ?credential apods:publicKey ?publicKey . }
            OPTIONAL { ?credential apods:counter ?counter . }
            OPTIONAL { ?credential apods:transportsJson ?transportsJson . }
            OPTIONAL { ?credential apods:deviceType ?deviceType . }
            OPTIONAL { ?credential apods:backedUp ?backedUp . }
            OPTIONAL { ?credential apods:createdAt ?createdAt . }
            OPTIONAL { ?credential apods:updatedAt ?updatedAt . }
            OPTIONAL { ?credential apods:lastUsedAt ?lastUsedAt . }
          }
          ORDER BY DESC(?updatedAt)
        `,
        dataset: 'settings',
        webId: 'system'
      });

      return (rows || []).map(row => ({
        id: this.readQueryBinding(row, 'credential'),
        credentialId: this.readQueryBinding(row, 'credentialId'),
        webId: this.readQueryBinding(row, 'webId'),
        userHandle: this.readQueryBinding(row, 'userHandle'),
        publicKey: this.readQueryBinding(row, 'publicKey'),
        counter: Number(this.readQueryBinding(row, 'counter') || 0),
        transports: this.readJsonBinding(row, 'transportsJson'),
        deviceType: this.readQueryBinding(row, 'deviceType'),
        backedUp: this.readBooleanBinding(row, 'backedUp'),
        createdAt: this.readQueryBinding(row, 'createdAt'),
        updatedAt: this.readQueryBinding(row, 'updatedAt'),
        lastUsedAt: this.readQueryBinding(row, 'lastUsedAt')
      }));
    },

    readQueryBinding(row, key) {
      const value = row?.[key];
      if (typeof value === 'string' || typeof value === 'boolean') return value;
      if (value && typeof value === 'object' && typeof value.value === 'string') {
        return value.value;
      }
      return null;
    },

    readJsonBinding(row, key) {
      const value = this.readQueryBinding(row, key);
      if (!value) return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_error) {
        return [];
      }
    },

    readBooleanBinding(row, key) {
      const value = this.readQueryBinding(row, key);
      if (value === null || value === undefined) return null;
      if (typeof value === 'boolean') return value;
      return String(value).toLowerCase() === 'true';
    },

    triplestoreRetryPolicy(error) {
      const code = Number(error?.code);
      if (error?.name === 'TimeoutError') return true;
      if (Number.isFinite(code) && (code === 408 || code === 425 || code === 429 || code >= 500)) return true;
      return /timeout|temporar|unavailable|econn|socket/i.test(String(error?.message || ''));
    },

    async triplestoreQueryWithBackoff(ctx, payload) {
      return retryWithBackoff(
        () => ctx.call('triplestore.query', payload),
        {
          maxRetries: 3,
          baseDelayMs: 60,
          maxDelayMs: 1200,
          retryIf: err => this.triplestoreRetryPolicy(err)
        }
      );
    },

    async triplestoreUpdateWithBackoff(ctx, payload) {
      return retryWithBackoff(
        () => ctx.call('triplestore.update', payload),
        {
          maxRetries: 3,
          baseDelayMs: 60,
          maxDelayMs: 1200,
          retryIf: err => this.triplestoreRetryPolicy(err)
        }
      );
    }
  }
};
