const { Errors } = require('moleculer');
const { MoleculerError } = Errors;
const crypto = require('crypto');

module.exports = {
  name: 'unified-account-api',
  dependencies: ['api', 'provider-capabilities', 'unified-account'],

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: '/',
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        onBeforeCall(ctx, route, req) {
          ctx.meta.$headers = req.headers;
        },
        aliases: {
          'POST /api/accounts/create': 'unified-account-api.create'
        }
      },
      toBottom: false
    });

    this.logger.info('[UnifiedAccount] Route POST /api/accounts/create registered');
  },

  actions: {
    async create(ctx) {
      let provisioningGrant = null;

      try {
        const accountParams = this.normalizeAccountCreateParams(ctx.params || {});
        const headers = ctx.meta?.$headers || {};
        const appClientId = ctx.params?.appClientId;
        const idempotencyKey = headers['idempotency-key'] || headers['Idempotency-Key'] || ctx.params?.idempotencyKey;
        const requestedProtocols = this.requestedProtocolsFromAccountParams(accountParams);

        provisioningGrant = await ctx.call('provider-capabilities.reserveAccountProvisioning', {
          appClientId,
          authorization: headers.authorization || headers.Authorization || '',
          origin: headers.origin || headers.Origin || '',
          redirectUri: ctx.params?.redirectUri,
          idempotencyKey,
          requestFingerprint: this.fingerprintAccountCreateRequest({
            appClientId,
            redirectUri: ctx.params?.redirectUri,
            accountParams,
            requestedProtocols
          }),
          username: accountParams.username,
          email: accountParams.email,
          requestedProtocols,
          verification: ctx.params?.verification
        });

        if (provisioningGrant.idempotency?.replay === true) {
          ctx.meta.$statusCode = provisioningGrant.idempotency.statusCode || 201;
          return provisioningGrant.idempotency.response;
        }

        ctx.meta.$statusCode = 201;
        const result = await ctx.call('unified-account.create', accountParams, {
          meta: {
            ...(ctx.meta || {}),
            accountProvisioning: provisioningGrant
          }
        });

        try {
          await ctx.call('provider-capabilities.completeAccountProvisioning', {
            grant: provisioningGrant,
            response: result,
            statusCode: ctx.meta.$statusCode || 201
          });
        } catch (stateErr) {
          this.logger.warn(`[UnifiedAccount] Failed to store provisioning idempotency completion: ${stateErr.message}`);
        }

        return result;
      } catch (e) {
        if (provisioningGrant && provisioningGrant.idempotency?.replay !== true) {
          try {
            await ctx.call('provider-capabilities.failAccountProvisioning', {
              grant: provisioningGrant,
              reasonCode: e.type || 'provisioning_failed',
              message: e.message
            });
          } catch (stateErr) {
            this.logger.warn(`[UnifiedAccount] Failed to mark provisioning idempotency failure: ${stateErr.message}`);
          }
        }

        const statusCode = Number.isFinite(Number(e.code)) ? Number(e.code) : 500;
        throw new MoleculerError(e.message || 'Unable to create account', statusCode, e.type || 'UNIFIED_ACCOUNT_CREATE_FAILED', {
          phase: e.data?.phase,
          capabilityId: e.data?.capabilityId,
          reasonCode: e.data?.reasonCode,
          retryable: e.data?.retryable
        });
      }
    }
  },

  methods: {
    normalizeAccountCreateParams(params) {
      const accountParams = { ...params };
      const protocols = params.protocols && typeof params.protocols === 'object' ? params.protocols : null;

      if (protocols) {
        if (Object.prototype.hasOwnProperty.call(protocols, 'solid')) {
          accountParams.solid = {
            ...(accountParams.solid || {}),
            enabled: protocols.solid !== false
          };
        }

        if (Object.prototype.hasOwnProperty.call(protocols, 'activitypub')) {
          accountParams.activitypub = {
            ...(accountParams.activitypub || {}),
            enabled: protocols.activitypub !== false
          };
        }

        if (Object.prototype.hasOwnProperty.call(protocols, 'atproto')) {
          const atproto = protocols.atproto;
          const atprotoConfig = atproto && typeof atproto === 'object' ? atproto : { enabled: atproto === true };
          accountParams.atproto = {
            ...(accountParams.atproto || {}),
            enabled: atprotoConfig.enabled === true,
            requestedHandle:
              atprotoConfig.handle ||
              atprotoConfig.requestedHandle ||
              accountParams.atproto?.requestedHandle,
            didMethod: this.normalizeDidMethod(atprotoConfig.didMethod || accountParams.atproto?.didMethod),
            force: atprotoConfig.force ?? accountParams.atproto?.force
          };
        }
      }

      if (accountParams.atproto?.didMethod) {
        accountParams.atproto = {
          ...accountParams.atproto,
          didMethod: this.normalizeDidMethod(accountParams.atproto.didMethod)
        };
      }

      delete accountParams.appClientId;
      delete accountParams.verification;
      delete accountParams.protocols;
      delete accountParams.acceptedTermsVersion;
      delete accountParams.redirectUri;
      delete accountParams.idempotencyKey;

      return accountParams;
    },

    normalizeDidMethod(value) {
      if (value === 'did:plc') return 'plc';
      if (value === 'did:web') return 'web';
      return value;
    },

    requestedProtocolsFromAccountParams(params) {
      return {
        solid: params.solid?.enabled !== false,
        activitypub: params.activitypub?.enabled !== false,
        atproto: params.atproto?.enabled !== false
      };
    },

    fingerprintAccountCreateRequest(input) {
      return crypto
        .createHash('sha256')
        .update(this.stableStringify({
          appClientId: input.appClientId || null,
          redirectUri: input.redirectUri || null,
          account: input.accountParams,
          requestedProtocols: input.requestedProtocols
        }))
        .digest('hex');
    },

    stableStringify(value) {
      if (Array.isArray(value)) {
        return `[${value.map(item => this.stableStringify(item)).join(',')}]`;
      }

      if (value && typeof value === 'object') {
        return `{${Object.keys(value)
          .sort()
          .map(key => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`)
          .join(',')}}`;
      }

      return JSON.stringify(value);
    }
  }
};
