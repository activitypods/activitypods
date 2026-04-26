'use strict';

const { Errors } = require('moleculer');

const { MoleculerError } = Errors;

const normalizeHttpsUri = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
};

module.exports = {
  name: 'actor-metadata-api',
  dependencies: ['api', 'actor-metadata-verification'],

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: '/api/actor-metadata',
        authorization: true,
        authentication: true,
        bodyParsers: { json: { strict: false, limit: '16kb' } },
        aliases: {
          'POST /verify': 'actor-metadata-api.verifyActorMetadata',
          'POST /verify-link': 'actor-metadata-api.verifyRelMeLink'
        }
      },
      toBottom: false
    });

    this.logger.info('[ActorMetadataApi] Routes POST /api/actor-metadata/verify and /verify-link registered');
  },

  actions: {
    verifyActorMetadata: {
      params: {
        actorUri: { type: 'string', optional: true, trim: true, max: 2048 }
      },
      async handler(ctx) {
        const requester = normalizeHttpsUri(ctx.meta.webId);
        if (!requester || requester === 'anon') {
          throw new MoleculerError('Authentication required', 401, 'UNAUTHORIZED');
        }

        const requestedActorUri = ctx.params.actorUri ? normalizeHttpsUri(ctx.params.actorUri) : requester;
        if (!requestedActorUri) {
          throw new MoleculerError('actorUri must be an absolute https:// URL', 400, 'INVALID_ACTOR_URI');
        }

        // Privacy boundary: users can only verify metadata for their own actor.
        if (requestedActorUri !== requester) {
          throw new MoleculerError('You can only verify metadata for your own actor', 403, 'FORBIDDEN_ACTOR_SCOPE');
        }

        try {
          const result = await ctx.call('actor-metadata-verification.verifyActorMetadata', {
            actorUri: requestedActorUri
          });
          ctx.meta.$statusCode = 200;
          return result;
        } catch (error) {
          throw this.toApiError(error);
        }
      }
    },

    verifyRelMeLink: {
      params: {
        actorUri: { type: 'string', optional: true, trim: true, max: 2048 },
        href: { type: 'string', trim: true, max: 2048 }
      },
      async handler(ctx) {
        const requester = normalizeHttpsUri(ctx.meta.webId);
        if (!requester || requester === 'anon') {
          throw new MoleculerError('Authentication required', 401, 'UNAUTHORIZED');
        }

        const actorUri = ctx.params.actorUri ? normalizeHttpsUri(ctx.params.actorUri) : requester;
        if (!actorUri) {
          throw new MoleculerError('actorUri must be an absolute https:// URL', 400, 'INVALID_ACTOR_URI');
        }

        if (actorUri !== requester) {
          throw new MoleculerError('You can only verify links for your own actor', 403, 'FORBIDDEN_ACTOR_SCOPE');
        }

        const href = normalizeHttpsUri(ctx.params.href);
        if (!href) {
          throw new MoleculerError('href must be an absolute https:// URL', 400, 'INVALID_REL_ME_HREF');
        }

        try {
          const result = await ctx.call('actor-metadata-verification.verifyRelMeLink', {
            actorUri,
            href
          });
          ctx.meta.$statusCode = 200;
          return result;
        } catch (error) {
          throw this.toApiError(error);
        }
      }
    }
  },

  methods: {
    toApiError(error) {
      const raw = Number(error?.code);
      const statusCode = Number.isFinite(raw) && raw >= 400 && raw < 600 ? raw : 500;
      const type = typeof error?.type === 'string' ? error.type : 'ACTOR_METADATA_API_ERROR';
      return new MoleculerError(
        error?.message || 'Unable to process actor metadata verification request',
        statusCode,
        type
      );
    }
  }
};
