"use strict";

const { Errors } = require('moleculer');

const { MoleculerError } = Errors;

/** Maximum allowed byte length for reply content (synced with the Elysia client validator). */
const CONTENT_MAX_LENGTH = 5000;

/**
 * Returns a validated, normalised https:// IRI string, or null if the input
 * is not a well-formed absolute HTTPS URL. Rejects:
 *   - non-string values
 *   - overly long strings (> 2048 chars – RFC 7230 practical limit)
 *   - any scheme other than https
 *   - URLs with userinfo (potential SSRF confusion)
 *   - private/loopback addresses that could enable SSRF
 */
const validateObjectUri = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  // Block private/loopback ranges (SSRF guard): resolved at DNS is server-side
  // concern; we block obvious cases here.
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return null;
  }
  return parsed.href;
};

/**
 * Strips null bytes and C0/C1 control characters (except common whitespace)
 * from user-supplied content strings to prevent log-injection and downstream
 * storage issues. Does NOT strip HTML — that is the pod's responsibility.
 */
const sanitizeContent = raw => {
  if (typeof raw !== 'string') return '';
  // Remove null bytes and all C0 controls except \t \n \r, plus C1 block
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
};

module.exports = {
  name: 'reply-policies-api',
  dependencies: ['api', 'reply-policies'],

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: '/api/reply-policies',
        authorization: true,
        authentication: true,
        bodyParsers: { json: { strict: false, limit: '16kb' } },
        aliases: {
          'POST /resolve': 'reply-policies-api.resolve',
          'POST /reply': 'reply-policies-api.reply'
        }
      },
      toBottom: false
    });

    this.logger.info('[ReplyPoliciesApi] Routes POST /api/reply-policies/resolve and /api/reply-policies/reply registered');
  },

  actions: {
    resolve: {
      params: {
        // Validated further in handler; 'string' keeps Moleculer from rejecting
        // non-string inputs before we can return a meaningful 400.
        objectUri: { type: 'string', trim: true, max: 2048 }
      },
      async handler(ctx) {
        const replierActorUri = ctx.meta.webId;
        if (!replierActorUri || replierActorUri === 'anon') {
          throw new MoleculerError('Authentication required to resolve reply policy', 401, 'UNAUTHORIZED');
        }

        const objectUri = validateObjectUri(ctx.params.objectUri);
        if (!objectUri) {
          throw new MoleculerError(
            'objectUri must be an absolute https:// URL',
            400,
            'INVALID_OBJECT_URI'
          );
        }

        try {
          return await ctx.call('reply-policies.resolveOutboundReplyPolicy', {
            objectUri,
            replierActorUri,
            webId: replierActorUri,
          });
        } catch (error) {
          throw this.toApiError(error);
        }
      }
    },

    reply: {
      params: {
        objectUri: { type: 'string', trim: true, max: 2048 },
        content:   { type: 'string', trim: true, min: 1, max: CONTENT_MAX_LENGTH },
        isPublic:  { type: 'boolean', optional: true },
      },
      async handler(ctx) {
        const replierActorUri = ctx.meta.webId;
        if (!replierActorUri || replierActorUri === 'anon') {
          throw new MoleculerError('Authentication required to submit replies', 401, 'UNAUTHORIZED');
        }

        const objectUri = validateObjectUri(ctx.params.objectUri);
        if (!objectUri) {
          throw new MoleculerError(
            'objectUri must be an absolute https:// URL',
            400,
            'INVALID_OBJECT_URI'
          );
        }

        const content = sanitizeContent(ctx.params.content);
        if (content.length === 0) {
          throw new MoleculerError('Reply content must not be empty after sanitization', 400, 'EMPTY_CONTENT');
        }
        if (content.length > CONTENT_MAX_LENGTH) {
          throw new MoleculerError(
            `Reply content exceeds the maximum of ${CONTENT_MAX_LENGTH} characters`,
            400,
            'CONTENT_TOO_LONG'
          );
        }

        try {
          const result = await ctx.call('reply-policies.submitReply', {
            objectUri,
            content,
            isPublic: ctx.params.isPublic,
            replierActorUri,
            webId: replierActorUri,
          });
          ctx.meta.$statusCode = result.pendingApproval ? 202 : 200;
          return result;
        } catch (error) {
          throw this.toApiError(error);
        }
      }
    }
  },

  methods: {
    toApiError(error) {
      // Preserve explicit HTTP status codes set by the domain layer (404, 403,
      // etc.).  Clamp anything unexpected into 500 to avoid leaking internals.
      const raw = Number(error?.code);
      const statusCode = Number.isFinite(raw) && raw >= 400 && raw < 600 ? raw : 500;
      const type = typeof error?.type === 'string' ? error.type : 'REPLY_POLICIES_API_ERROR';
      return new MoleculerError(error?.message || 'Unable to process reply policy request', statusCode, type);
    }
  }
};
