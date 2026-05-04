'use strict';

/**
 * Internal DM API
 *
 * Bearer-token-protected REST endpoints the Fedify sidecar calls to manage
 * DM conversations and serve participant autocomplete data.
 *
 * Routes registered under /api/internal/dm:
 *
 *   POST /conversations/upsert
 *     Body: { actorIdentifier, participantUris: string[], timestamp? }
 *     → { conversationId, isNew }
 *     Create or bump a conversation record for the local actor.
 *
 *   GET  /conversations?actorIdentifier={id}&limit={n}&offset={n}
 *     → { items: [{ conversationId, participantUris, lastMessageAt, createdAt }] }
 *     Paginated conversation list, newest first.
 *
 *   GET  /participants?actorIdentifier={id}&query={q}&limit={n}
 *     → { items: [participantUri] }
 *     Unique participant URIs for @mention autocomplete, optionally filtered by
 *     query substring. Only actors already in a conversation are returned —
 *     random/unknown actors are never suggested.
 *
 * The bearer token must match ACTIVITYPODS_TOKEN (the shared sidecar secret).
 */

const crypto = require('crypto');
const { Errors: WebErrors } = require('moleculer-web');

module.exports = {
  name: 'internal-dm-api',

  dependencies: ['api', 'dm.conversations', 'auth.account', 'activitypub.actor'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
    },
    routePath: '/api/internal/dm'
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[DmApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'dm-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '64kb' } },
        onBeforeCall: (ctx, route, req) => {
          const authHeader = (req.headers.authorization || req.headers.Authorization || '').trim();
          const token = this.parseBearerToken(authHeader);
          if (!this.safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(WebErrors.ERR_INVALID_TOKEN, null, 'Unauthorized');
          }
          ctx.meta.$responseHeaders = {
            ...(ctx.meta.$responseHeaders || {}),
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff'
          };
        },
        aliases: {
          'POST /conversations/upsert': 'internal-dm-api.upsertConversation',
          'GET /conversations': 'internal-dm-api.listConversations',
          'GET /participants': 'internal-dm-api.listParticipants'
        }
      },
      toBottom: false
    });

    this.logger.info('[DmApi] Internal routes registered under /api/internal/dm: conversations, participants');
  },

  actions: {
    // =========================================================================
    // POST /conversations/upsert
    // Body: { actorIdentifier, participantUris, timestamp? }
    // =========================================================================
    upsertConversation: {
      async handler(ctx) {
        const body = ctx.params ?? {};

        const actorIdentifier = typeof body.actorIdentifier === 'string' ? body.actorIdentifier.trim() : '';
        const participantUris = Array.isArray(body.participantUris) ? body.participantUris : null;
        const timestamp = typeof body.timestamp === 'string' ? body.timestamp : undefined;

        if (!actorIdentifier) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'actorIdentifier is required' };
        }
        if (!participantUris || participantUris.length < 2) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'participantUris must be an array of at least 2 URIs' };
        }
        if (!participantUris.every(u => typeof u === 'string' && u.startsWith('http'))) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'participantUris must be valid http(s) URIs' };
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
          result = await ctx.call('dm.conversations.upsert', { actorUri, participantUris, timestamp });
        } catch (err) {
          this.logger.error('[DmApi] upsertConversation failed', {
            actorIdentifier,
            error: err instanceof Error ? err.message : String(err)
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to upsert conversation' };
        }

        ctx.meta.$statusCode = result.isNew ? 201 : 200;
        return { conversationId: result.conversationId, isNew: result.isNew };
      }
    },

    // =========================================================================
    // GET /conversations?actorIdentifier={id}&limit={n}&offset={n}
    // =========================================================================
    listConversations: {
      async handler(ctx) {
        const actorIdentifier = String(
          ctx.params?.actorIdentifier ?? ctx.meta.queryString?.actorIdentifier ?? ''
        ).trim();
        const limit = Number(ctx.params?.limit ?? ctx.meta.queryString?.limit ?? 50) || 50;
        const offset = Number(ctx.params?.offset ?? ctx.meta.queryString?.offset ?? 0) || 0;

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
          items = await ctx.call('dm.conversations.list', { actorUri, limit, offset });
        } catch (err) {
          this.logger.error('[DmApi] listConversations failed', {
            actorIdentifier,
            error: err instanceof Error ? err.message : String(err)
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to list conversations' };
        }

        ctx.meta.$statusCode = 200;
        return { items };
      }
    },

    // =========================================================================
    // GET /participants?actorIdentifier={id}&query={q}&limit={n}
    // Returns unique participant URIs for @mention autocomplete.
    // Only actors with an existing conversation are returned — this enforces
    // participant-scoped mention behavior and prevents mention of unknown actors.
    // =========================================================================
    listParticipants: {
      async handler(ctx) {
        const actorIdentifier = String(
          ctx.params?.actorIdentifier ?? ctx.meta.queryString?.actorIdentifier ?? ''
        ).trim();
        const query = String(ctx.params?.query ?? ctx.meta.queryString?.query ?? '').trim();
        const limit = Number(ctx.params?.limit ?? ctx.meta.queryString?.limit ?? 20) || 20;

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
          items = await ctx.call('dm.conversations.listParticipants', { actorUri, query, limit });
        } catch (err) {
          this.logger.error('[DmApi] listParticipants failed', {
            actorIdentifier,
            error: err instanceof Error ? err.message : String(err)
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to list participants' };
        }

        this.logger.debug('[DmApi] listParticipants', {
          actorIdentifier,
          query,
          itemCount: items.length
        });

        ctx.meta.$statusCode = 200;
        return { items };
      }
    }
  },

  methods: {
    async findActorByIdentifier(ctx, identifier) {
      try {
        const account = await ctx.call('auth.account.findByUsername', { username: identifier });
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
    }
  }
};
