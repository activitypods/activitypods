'use strict';

const crypto = require('crypto');
const Redis = require('ioredis');
const { Errors: WebErrors } = require('moleculer-web');
const { MoleculerError } = require('moleculer').Errors;

const TOPIC_NOTIFICATIONS = 'notifications';
const TOPIC_PERSONAL_FEED = 'feeds/personal';
const EVENT_NOTIFICATION = 'notification';
const EVENT_FEED = 'feed';

const TOPICS = new Set([TOPIC_NOTIFICATIONS, TOPIC_PERSONAL_FEED]);
const EVENTS = new Set([EVENT_NOTIFICATION, EVENT_FEED]);

function parseBearerToken(value) {
  if (!value || typeof value !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match ? match[1] : null;
}

function safeTokenEquals(expected, provided) {
  if (!expected || !provided) return false;
  const left = Buffer.from(String(expected), 'utf8');
  const right = Buffer.from(String(provided), 'utf8');
  const max = Math.max(left.length, right.length);
  const leftPadded = Buffer.alloc(max, 0);
  const rightPadded = Buffer.alloc(max, 0);
  left.copy(leftPadded);
  right.copy(rightPadded);
  return left.length === right.length && crypto.timingSafeEqual(leftPadded, rightPadded);
}

function normalizePrincipal(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096) return null;

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MoleculerError('payload must be a plain JSON object', 400, 'INVALID_PAYLOAD');
  }
  return value;
}

module.exports = {
  name: 'realtime-private-emitter',

  dependencies: ['api'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
    },
    routePath: '/api/internal/streaming',
    redisUrl: process.env.REDIS_URL || process.env.REDIS_OIDC_PROVIDER_URL || 'redis://localhost:6379',
    channel: process.env.FEP_3AB2_PRIVATE_REALTIME_CHANNEL || 'fep3ab2:private-events'
  },

  async started() {
    this.redis = new Redis(this.settings.redisUrl);
    this.redis.on('error', error => {
      this.logger.error('[RealtimePrivateEmitter] Redis client error: %s', error.message);
    });

    const bearerToken = this.settings.auth.bearerToken;
    if (!bearerToken) {
      this.logger.warn('[RealtimePrivateEmitter] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'realtime-private-emitter-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '64kb' } },
        onBeforeCall: (_ctx, _route, req) => {
          const token = parseBearerToken(req.headers.authorization || req.headers.Authorization);
          if (!safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(WebErrors.ERR_INVALID_TOKEN, null, 'Unauthorized');
          }
        },
        aliases: {
          'POST /private-event': 'realtime-private-emitter.publish'
        }
      },
      toBottom: false
    });

    this.logger.info('[RealtimePrivateEmitter] Internal route registered under /api/internal/streaming/private-event');
  },

  async stopped() {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
      this.redis = null;
    }
  },

  actions: {
    async publish(ctx) {
      const topic = typeof ctx.params?.topic === 'string' ? ctx.params.topic.trim() : '';
      if (!TOPICS.has(topic)) {
        throw new MoleculerError(`topic must be ${TOPIC_NOTIFICATIONS} or ${TOPIC_PERSONAL_FEED}`, 400, 'INVALID_TOPIC');
      }

      const event = typeof ctx.params?.event === 'string' ? ctx.params.event.trim() : '';
      if (!EVENTS.has(event)) {
        throw new MoleculerError(`event must be ${EVENT_NOTIFICATION} or ${EVENT_FEED}`, 400, 'INVALID_EVENT');
      }

      const principal = normalizePrincipal(ctx.params?.principal);
      if (!principal || principal === 'anon') {
        throw new MoleculerError('principal must be a valid authenticated actor URI', 400, 'INVALID_PRINCIPAL');
      }

      const occurredAt = typeof ctx.params?.occurredAt === 'string' && ctx.params.occurredAt.trim()
        ? new Date(ctx.params.occurredAt).toISOString()
        : new Date().toISOString();

      const payload = normalizePayload(ctx.params?.payload);
      const id = typeof ctx.params?.id === 'string' && ctx.params.id.trim()
        ? ctx.params.id.trim().slice(0, 512)
        : undefined;

      await this.redis.publish(
        this.settings.channel,
        JSON.stringify({
          topic,
          event,
          principal,
          occurredAt,
          ...(id ? { id } : {}),
          payload
        })
      );

      ctx.meta.$statusCode = 202;
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      };

      return {
        ok: true,
        channel: this.settings.channel,
        topic,
        principal
      };
    }
  }
};
