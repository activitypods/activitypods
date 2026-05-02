'use strict';

/**
 * Internal MLS Messages API
 *
 * Bearer-token-protected internal REST endpoints the Fedify sidecar uses to:
 *   - List an actor's stored MLS messages (GET /messages → sidecar GET /users/:id/messages)
 *   - Store an incoming MLS message delivered from a remote actor
 *     (POST /deliver → sidecar POST /users/:id/messages)
 *
 * All endpoints are on /api/internal/mls-messages.  The sidecar has already
 * verified the remote actor's HTTP Signature before calling POST /deliver.
 */

const crypto = require('crypto');
const { Errors: WebErrors } = require('moleculer-web');

// Accepted MLS message types per AP E2EE spec
const VALID_MLS_TYPES = new Set(['PublicMessage', 'PrivateMessage', 'Welcome', 'GroupInfo']);
const BASE64_RE = /^[A-Za-z0-9+/]+=*$/;

module.exports = {
  name: 'internal-mls-messages-api',

  dependencies: ['api', 'mls.messages', 'auth.account', 'activitypub.actor'],

  settings: {
    auth: {
      bearerToken:
        process.env.ACTIVITYPODS_TOKEN ||
        process.env.INTERNAL_API_TOKEN ||
        process.env.SIDECAR_TOKEN ||
        '',
    },
    routePath: '/api/internal/mls-messages',
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn(
        '[MlsMessagesApi] No internal bearer token configured; all requests will be rejected',
      );
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'mls-messages-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '4mb' } },
        onBeforeCall: (ctx, route, req) => {
          const authHeader = (
            req.headers.authorization ||
            req.headers.Authorization ||
            ''
          ).trim();
          const token = this.parseBearerToken(authHeader);
          if (!this.safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(
              WebErrors.ERR_INVALID_TOKEN,
              null,
              'Unauthorized',
            );
          }
          ctx.meta.$responseHeaders = {
            ...(ctx.meta.$responseHeaders || {}),
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff',
          };
        },
        aliases: {
          'GET /messages': 'internal-mls-messages-api.getMessages',
          'POST /deliver': 'internal-mls-messages-api.deliver',
        },
      },
      toBottom: false,
    });

    this.logger.info(
      '[MlsMessagesApi] Internal routes registered under /api/internal/mls-messages: messages, deliver',
    );
  },

  actions: {
    // =========================================================================
    // GET /messages?actorIdentifier={id}
    // =========================================================================

    getMessages: {
      async handler(ctx) {
        const actorIdentifier = String(
          ctx.params?.actorIdentifier ?? ctx.meta.queryString?.actorIdentifier ?? '',
        ).trim();

        if (!actorIdentifier) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'actorIdentifier is required' };
        }

        const actor = await this.findActorByIdentifier(ctx, actorIdentifier);
        if (!actor) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: `Actor not found: ${actorIdentifier}` };
        }

        const actorUri = actor.id || actor['@id'];
        if (!actorUri) {
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Actor URI could not be resolved' };
        }

        let items;
        try {
          items = await ctx.call('mls.messages.list', { actorUri });
        } catch (err) {
          this.logger.error('[MlsMessagesApi] failed to list messages', {
            actorIdentifier,
            error: err instanceof Error ? err.message : String(err),
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to retrieve messages' };
        }

        ctx.meta.$statusCode = 200;
        return { items };
      },
    },

    // =========================================================================
    // POST /deliver
    // Body: { actorIdentifier, senderUri, type, content, externalId? }
    // =========================================================================

    deliver: {
      async handler(ctx) {
        const body = ctx.params ?? {};

        const actorIdentifier = typeof body.actorIdentifier === 'string'
          ? body.actorIdentifier.trim()
          : '';
        const senderUri = typeof body.senderUri === 'string'
          ? body.senderUri.trim()
          : '';
        const type = typeof body.type === 'string' ? body.type.trim() : '';
        const content = typeof body.content === 'string' ? body.content.trim() : '';

        if (!actorIdentifier) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'actorIdentifier is required' };
        }

        if (!senderUri) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'senderUri is required' };
        }

        if (!VALID_MLS_TYPES.has(type)) {
          ctx.meta.$statusCode = 400;
          return {
            error: 'invalid_request',
            message: `type must be one of: ${[...VALID_MLS_TYPES].join(', ')}`,
          };
        }

        if (!content || !BASE64_RE.test(content)) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'content must be non-empty valid base64' };
        }

        const actor = await this.findActorByIdentifier(ctx, actorIdentifier);
        if (!actor) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: `Actor not found: ${actorIdentifier}` };
        }

        const actorUri = actor.id || actor['@id'];
        if (!actorUri) {
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Actor URI could not be resolved' };
        }

        let result;
        try {
          result = await ctx.call('mls.messages.deliver', {
            actorUri,
            senderUri,
            type,
            content,
            ...(body.externalId ? { externalId: String(body.externalId) } : {}),
          });
        } catch (err) {
          this.logger.error('[MlsMessagesApi] failed to store message', {
            actorIdentifier,
            senderUri,
            type,
            error: err instanceof Error ? err.message : String(err),
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to store message' };
        }

        this.logger.debug('[MlsMessagesApi] message delivered', {
          actorIdentifier,
          senderUri,
          type,
          messageId: result.id,
        });

        ctx.meta.$statusCode = 201;
        return { id: result.id, type: result.type, publishedAt: result.publishedAt };
      },
    },
  },

  methods: {
    async findActorByIdentifier(ctx, identifier) {
      try {
        const account = await ctx.call('auth.account.findByUsername', {
          username: identifier,
        });
        if (!account?.webId) return null;
        const actor = await ctx.call('activitypub.actor.get', { actorUri: account.webId });
        return actor || null;
      } catch {
        return null;
      }
    },

    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== 'string') return '';
      if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
      return authHeader.slice(7).trim();
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      if (typeof expected !== 'string' || typeof provided !== 'string') return false;
      if (expected.length === 0 || provided.length === 0) return false;
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(provided, 'utf8');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    },
  },
};
