'use strict';

const crypto = require('crypto');
const { Errors: WebErrors } = require('moleculer-web');
const { MoleculerError } = require('moleculer').Errors;

const PHASE1_TOPIC_NOTIFICATIONS = 'notifications';
const PHASE1_TOPIC_PERSONAL_FEED = 'feeds/personal';
const PHASE1_TOPIC_LOCAL_FEED = 'feeds/local';
const PHASE1_TOPIC_GLOBAL_FEED = 'feeds/global';

const PHASE1_TOPICS = new Set([
  'feeds/public/local',
  'feeds/public/remote',
  'feeds/public/unified',
  'feeds/public/canonical',
  PHASE1_TOPIC_NOTIFICATIONS,
  PHASE1_TOPIC_PERSONAL_FEED,
  PHASE1_TOPIC_LOCAL_FEED,
  PHASE1_TOPIC_GLOBAL_FEED
]);

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

function normalizeTopics(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter(item => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 32)
    )
  ).sort();
}

function authorizeTopic(topic) {
  if (PHASE1_TOPICS.has(topic)) {
    return { allowed: true };
  }

  if (isExactUriTopic(topic)) {
    return { allowed: true };
  }

  if (isBoundedWildcardTopic(topic)) {
    const segments = splitTopicSegments(topic);
    const wildcardIndex = firstWildcardIndex(segments);

    if (!looksLikeAuthoritySegment(segments[0])) {
      return deny(topic, 'wildcard_namespace_forbidden', 'Wildcard subscriptions are limited to URI-derived ActivityPub topics');
    }

    if (wildcardIndex < 2) {
      return deny(topic, 'wildcard_scope_too_broad', 'Wildcard subscriptions must include at least one exact path segment after the authority');
    }

    return { allowed: true };
  }

  return deny(topic, 'unsupported_topic', 'The requested topic is not part of the supported streaming surface');
}

function deny(topic, reasonCode, message) {
  return {
    allowed: false,
    denied: {
      topic,
      reasonCode,
      message
    }
  };
}

function isExactUriTopic(topic) {
  if (typeof topic !== 'string' || !topic || PHASE1_TOPICS.has(topic) || hasWildcardSegments(topic)) {
    return false;
  }

  const segments = splitTopicSegments(topic);
  if (!segments || segments.length === 0) {
    return false;
  }

  const [authority, ...rest] = segments;
  return looksLikeAuthoritySegment(authority) && rest.every(isValidExactTopicSegment);
}

function isBoundedWildcardTopic(topic) {
  if (typeof topic !== 'string' || !topic || !hasWildcardSegments(topic)) {
    return false;
  }

  const segments = splitTopicSegments(topic);
  if (!segments || segments.length === 0 || segments[0] === '+' || segments[0] === '#') {
    return false;
  }

  let wildcardCount = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === '#') {
      wildcardCount += 1;
      if (index !== segments.length - 1) {
        return false;
      }
      continue;
    }
    if (segment === '+') {
      wildcardCount += 1;
      continue;
    }
    if (!isValidExactTopicSegment(segment)) {
      return false;
    }
  }

  return wildcardCount > 0 && wildcardCount <= 4;
}

function splitTopicSegments(topic) {
  if (typeof topic !== 'string') return null;
  const trimmed = topic.trim();
  if (!trimmed || trimmed.length > 4096) return null;
  const segments = trimmed.split('/');
  if (segments.length === 0 || segments.length > 64) return null;
  if (segments.some(segment => !segment)) return null;
  return segments;
}

function firstWildcardIndex(segments) {
  return segments.findIndex(segment => segment === '+' || segment === '#');
}

function hasWildcardSegments(topic) {
  const segments = splitTopicSegments(topic);
  return !!segments && segments.some(segment => segment === '+' || segment === '#');
}

function looksLikeAuthoritySegment(segment) {
  if (!segment || segment.length > 255 || /[+#]/.test(segment) || containsControlOrWhitespace(segment)) {
    return false;
  }

  return /^(localhost|(\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+)(:\d{1,5})?$/i.test(segment);
}

function isValidExactTopicSegment(segment) {
  if (!segment || segment.length > 255 || segment === '+' || segment === '#') {
    return false;
  }
  if (/[+#]/.test(segment)) {
    return false;
  }
  return !containsControlOrWhitespace(segment);
}

function containsControlOrWhitespace(value) {
  return /[\u0000-\u001f\u007f\s]/u.test(value);
}

module.exports = {
  name: 'streaming-topic-authorization',

  dependencies: ['api'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
    },
    routePath: '/api/internal/streaming'
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[StreamingTopicAuthorization] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'streaming-topic-authorization-internal',
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
          'POST /authorize-topics': 'streaming-topic-authorization.authorizeTopics'
        }
      },
      toBottom: false
    });

    this.logger.info('[StreamingTopicAuthorization] Internal route registered under /api/internal/streaming/authorize-topics');
  },

  actions: {
    async authorizeTopics(ctx) {
      this.applyResponseHeaders(ctx);

      const principal = normalizePrincipal(ctx.params?.principal);
      if (!principal || principal === 'anon') {
        throw new MoleculerError('principal must be a valid authenticated actor URI', 401, 'LOGIN_REQUIRED');
      }

      const requestedTopics = normalizeTopics(ctx.params?.topics);
      if (requestedTopics.length === 0) {
        throw new MoleculerError('topics must contain at least one supported streaming topic', 400, 'INVALID_TOPICS');
      }

      const allowedTopics = [];
      const deniedTopics = [];

      for (const topic of requestedTopics) {
        const decision = authorizeTopic(topic);
        if (decision.allowed) {
          allowedTopics.push(topic);
          continue;
        }
        deniedTopics.push(decision.denied);
      }

      return {
        allowedTopics,
        deniedTopics
      };
    }
  },

  methods: {
    applyResponseHeaders(ctx) {
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      };
    }
  }
};
