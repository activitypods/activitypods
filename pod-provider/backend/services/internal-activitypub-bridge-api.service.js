const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;
const { Errors: WebErrors } = require('moleculer-web');

// ---------------------------------------------------------------------------
// Media resolution helpers (inline — these run inside the activity-pods
// process; the fedify-sidecar bridge clients POST mediaUrl here and expect
// back { mediaUrl, mimeType, bytesBase64, size }).
// ---------------------------------------------------------------------------

const ATTACHMENT_ACCEPT_HEADER = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/avif',
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/gif',
  'video/*;q=0.9',
  'image/*;q=0.8',
  '*/*;q=0.1',
].join(', ');

const PROFILE_ACCEPT_HEADER = [
  'image/avif',
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/*;q=0.8',
  '*/*;q=0.1',
].join(', ');

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

const ALLOWED_PROFILE_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);

/** Parse a Content-Length header value into a number, or null. */
function parseContentLengthHeader(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Normalise a Content-Type header to a bare MIME type string. */
function normalizeMimeTypeHeader(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.split(';')[0].trim().toLowerCase();
}

/** Choose the canonical MIME type from header + sniffed values. */
function chooseAttachmentMimeType(headerMime, sniffedMime) {
  if (
    sniffedMime && headerMime &&
    headerMime !== 'application/octet-stream' &&
    sniffedMime !== headerMime
  ) {
    return null; // mismatch → reject
  }
  const candidate = sniffedMime || headerMime;
  if (!candidate || !ALLOWED_ATTACHMENT_MIME_TYPES.has(candidate)) return null;
  return candidate;
}

function chooseProfileMimeType(headerMime, sniffedMime) {
  if (sniffedMime && headerMime && sniffedMime !== headerMime) return null;
  const candidate = sniffedMime || headerMime;
  if (!candidate || !ALLOWED_PROFILE_MIME_TYPES.has(candidate)) return null;
  return candidate;
}

/** Magic-byte MIME sniffing for images and common video containers. */
function sniffMediaMimeType(buf) {
  const b = buf;
  // JPEG
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  // PNG
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  // GIF
  if (b.length >= 6) {
    const sig = b.subarray(0, 6).toString('ascii');
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
  }
  // WebP
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  // MP4 / QuickTime (ftyp box)
  if (b.length >= 12 && b.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = b.subarray(8, 12).toString('ascii');
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  // WebM
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}

function sniffImageMimeType(buf) {
  const b = buf;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 6) {
    const sig = b.subarray(0, 6).toString('ascii');
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
  }
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Fetch a remote media URL and return { mediaUrl, mimeType, bytesBase64, size }.
 * Throws with { code, statusCode } on failure.
 */
async function fetchRemoteMedia({ mediaUrl, acceptHeader, maxBytes, sniffFn, chooseMimeFn, label }) {
  let response;
  try {
    response = await fetch(mediaUrl, {
      method: 'GET',
      headers: { Accept: acceptHeader },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const e = new Error(`Failed to fetch remote ${label}: ${err?.message || String(err)}`);
    e.code = 'upstream_unavailable';
    e.statusCode = 503;
    throw e;
  }

  if (response.status === 404) {
    const e = new Error(`Remote ${label} could not be resolved.`);
    e.code = 'not_found';
    e.statusCode = 404;
    throw e;
  }

  if (!response.ok) {
    const transient = response.status === 429 || response.status >= 500;
    const e = new Error(`Remote ${label} lookup returned HTTP ${response.status}.`);
    e.code = transient ? 'upstream_unavailable' : 'resolution_failed';
    e.statusCode = transient ? 503 : 502;
    throw e;
  }

  const declaredLength = parseContentLengthHeader(response.headers.get('content-length'));
  if (declaredLength != null && declaredLength > maxBytes) {
    const e = new Error(`Remote ${label} exceeded ${maxBytes} bytes.`);
    e.code = 'payload_too_large';
    e.statusCode = 422;
    throw e;
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  if (bytes.byteLength === 0) {
    const e = new Error(`Remote ${label} response was empty.`);
    e.code = 'invalid_media';
    e.statusCode = 422;
    throw e;
  }

  if (bytes.byteLength > maxBytes) {
    const e = new Error(`Remote ${label} exceeded ${maxBytes} bytes.`);
    e.code = 'payload_too_large';
    e.statusCode = 422;
    throw e;
  }

  const headerMime = normalizeMimeTypeHeader(response.headers.get('content-type'));
  const sniffedMime = sniffFn(bytes);
  const mimeType = chooseMimeFn(headerMime, sniffedMime);

  if (!mimeType) {
    const e = new Error(`Remote ${label} has an unsupported or mismatched MIME type.`);
    e.code = 'unsupported_media_type';
    e.statusCode = 415;
    throw e;
  }

  return {
    mediaUrl,
    mimeType,
    bytesBase64: bytes.toString('base64'),
    size: bytes.byteLength,
  };
}

const RECIPIENT_FIELDS = ['to', 'cc', 'bto', 'bcc'];

// Limit concurrent remote actor resolution to avoid overwhelming the remote-fetch pool
const MAX_CONCURRENT_RESOLUTIONS = 10;

module.exports = {
  name: 'internal-activitypub-bridge-api',

  dependencies: ['api', 'activitypub.actor'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
    },
    routePath: '/api/internal/activitypub-bridge',
    maxRecipientUris: Number(process.env.AP_BRIDGE_MAX_RECIPIENT_URIS || 1000),
    maxDeliveries: Number(process.env.AP_BRIDGE_MAX_DELIVERIES || 500)
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[ActivityPubBridgeApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'activitypub-bridge-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '512kb' } },
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
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY'
          };
        },
        aliases: {
          'POST /resolve-outbound': 'internal-activitypub-bridge-api.resolveOutbound',
          'POST /resolve-media': 'internal-activitypub-bridge-api.resolveMedia',
          'POST /resolve-profile-media': 'internal-activitypub-bridge-api.resolveProfileMedia'
        }
      },
      toBottom: false
    });

    this.logger.info('[ActivityPubBridgeApi] Internal routes registered under /api/internal/activitypub-bridge: resolve-outbound, resolve-media, resolve-profile-media');
  },

  actions: {
    resolveOutbound: {
      async handler(ctx) {
        const actorUri = this.normalizeAbsoluteUrl(ctx.params?.actorUri, 'actorUri');
        const activity = ctx.params?.activity;

        if (!actorUri) {
          throw new MoleculerError('Missing actorUri', 400, 'INVALID_INPUT');
        }
        if (!activity || typeof activity !== 'object' || Array.isArray(activity)) {
          throw new MoleculerError('Missing activity object', 400, 'INVALID_INPUT');
        }

        const recipientUris = this.extractRecipientUris(activity);
        const deliveries = await this.resolveRemoteDeliveries(ctx, recipientUris);

        return {
          actorUri,
          deliveries,
          resolvedAt: new Date().toISOString()
        };
      }
    },

    resolveMedia: {
      async handler(ctx) {
        const mediaUrl = this.normalizeMediaUrl(ctx.params?.mediaUrl);
        if (!mediaUrl) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'mediaUrl must be a valid https URL or localhost http URL' };
        }

        const maxBytes = Number(ctx.params?.maxBytes) || 50 * 1024 * 1024;

        try {
          const result = await fetchRemoteMedia({
            mediaUrl,
            acceptHeader: ATTACHMENT_ACCEPT_HEADER,
            maxBytes,
            sniffFn: sniffMediaMimeType,
            chooseMimeFn: chooseAttachmentMimeType,
            label: 'attachment media',
          });
          ctx.meta.$statusCode = 200;
          return { ...result, resolvedAt: new Date().toISOString() };
        } catch (err) {
          const code = err.code || 'processing_error';
          const statusCode = err.statusCode || 500;
          if (statusCode < 500) {
            this.logger.warn('[ActivityPubBridgeApi] Attachment media resolution rejected', {
              mediaUrl, code, error: err.message
            });
          } else {
            this.logger.error('[ActivityPubBridgeApi] Unexpected attachment media resolution failure', {
              mediaUrl, error: err.message
            });
          }
          ctx.meta.$statusCode = statusCode;
          return { error: code, message: err.message };
        }
      }
    },

    resolveProfileMedia: {
      async handler(ctx) {
        const mediaUrl = this.normalizeMediaUrl(ctx.params?.mediaUrl);
        if (!mediaUrl) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'mediaUrl must be a valid https URL or localhost http URL' };
        }

        const maxBytes = Number(ctx.params?.maxBytes) || 5 * 1024 * 1024;

        try {
          const result = await fetchRemoteMedia({
            mediaUrl,
            acceptHeader: PROFILE_ACCEPT_HEADER,
            maxBytes,
            sniffFn: sniffImageMimeType,
            chooseMimeFn: chooseProfileMimeType,
            label: 'profile media',
          });
          ctx.meta.$statusCode = 200;
          return { ...result, resolvedAt: new Date().toISOString() };
        } catch (err) {
          const code = err.code || 'processing_error';
          const statusCode = err.statusCode || 500;
          if (statusCode < 500) {
            this.logger.warn('[ActivityPubBridgeApi] Profile media resolution rejected', {
              mediaUrl, code, error: err.message
            });
          } else {
            this.logger.error('[ActivityPubBridgeApi] Unexpected profile media resolution failure', {
              mediaUrl, error: err.message
            });
          }
          ctx.meta.$statusCode = statusCode;
          return { error: code, message: err.message };
        }
      }
    }
  },

  methods: {
    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== 'string') return null;
      // Case-insensitive scheme matching; single non-whitespace token value
      const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
      if (!match) return null;
      return match[1];
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      const exp = Buffer.from(String(expected), 'utf8');
      const got = Buffer.from(String(provided), 'utf8');
      // Pad to equal length, then compare both length and content in constant time
      const maxLen = Math.max(exp.length, got.length);
      const expPadded = Buffer.alloc(maxLen, 0);
      const gotPadded = Buffer.alloc(maxLen, 0);
      exp.copy(expPadded);
      got.copy(gotPadded);
      const lengthMatch = exp.length === got.length;
      const contentMatch = crypto.timingSafeEqual(expPadded, gotPadded);
      return lengthMatch && contentMatch;
    },

    /**
     * Normalise a media URL for resolve-media / resolve-profile-media.
     * Allows https:// anywhere and http:// only on localhost.
     */
    normalizeMediaUrl(value) {
      const normalized = String(value || '').trim();
      if (!normalized) return null;
      let parsed;
      try {
        parsed = new URL(normalized);
      } catch {
        return null;
      }
      if (parsed.protocol === 'https:') return parsed.toString();
      if (parsed.protocol === 'http:') {
        const h = parsed.hostname;
        if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return parsed.toString();
      }
      return null;
    },

    normalizeAbsoluteUrl(value, fieldName) {
      const normalized = String(value || '').trim();
      if (!normalized) return '';
      let parsed;
      try {
        parsed = new URL(normalized);
      } catch {
        throw new MoleculerError(`Invalid ${fieldName} URL`, 400, 'INVALID_INPUT');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new MoleculerError(`Invalid ${fieldName} protocol`, 400, 'INVALID_INPUT');
      }
      return parsed.toString();
    },

    extractRecipientUris(activity) {
      const values = new Set();

      for (const field of RECIPIENT_FIELDS) {
        const raw = activity?.[field];
        if (!raw) continue;

        const array = Array.isArray(raw) ? raw : [raw];
        for (const value of array) {
          if (typeof value !== 'string') continue;
          const trimmed = value.trim();
          if (!trimmed) continue;
          if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) continue;
          values.add(trimmed);
          if (values.size >= this.settings.maxRecipientUris) {
            throw new MoleculerError('Too many recipient URIs in activity', 400, 'INVALID_INPUT');
          }
        }
      }

      return [...values];
    },

    async resolveRemoteDeliveries(ctx, recipientUris) {
      const grouped = new Map();

      // Process in bounded concurrent batches to avoid overwhelming the actor-fetch pool
      for (let i = 0; i < recipientUris.length; i += MAX_CONCURRENT_RESOLUTIONS) {
        const batch = recipientUris.slice(i, i + MAX_CONCURRENT_RESOLUTIONS);

        await Promise.all(
          batch.map(async recipientUri => {
            try {
              const isLocal = await ctx.call('activitypub.actor.isLocal', { actorUri: recipientUri });
              if (isLocal) return;

              const actorDoc = await ctx.call('activitypub.actor.get', { actorUri: recipientUri });
              if (!actorDoc) return;

              const rawInbox = actorDoc.endpoints?.sharedInbox || actorDoc.inbox;
              if (!rawInbox) return;

              const inbox = this.normalizeAbsoluteUrl(rawInbox, 'recipient inbox');
              if (!inbox) return;

              const targetDomain = new URL(inbox).hostname;
              const sharedInbox = this.normalizeOptionalAbsoluteUrl(actorDoc.endpoints?.sharedInbox);
              const key = sharedInbox || inbox;

              const bucket = grouped.get(key) || {
                actor: recipientUri,
                targetDomain,
                recipients: new Set(),
                sharedInbox: sharedInbox || undefined
              };
              bucket.recipients.add(inbox);
              grouped.set(key, bucket);
            } catch (error) {
              this.logger.warn('[ActivityPubBridgeApi] Failed to resolve recipient', {
                recipientUri,
                error: error?.message || String(error)
              });
            }
          })
        );
      }

      const deliveries = [];
      for (const item of grouped.values()) {
        deliveries.push({
          actor: item.actor,
          targetDomain: item.targetDomain,
          recipients: [...item.recipients],
          sharedInbox: item.sharedInbox
        });
      }

      if (deliveries.length > this.settings.maxDeliveries) {
        throw new MoleculerError('Resolved delivery set is too large', 413, 'TOO_MANY_DELIVERIES');
      }

      return deliveries;
    },

    normalizeOptionalAbsoluteUrl(value) {
      if (!value) return undefined;
      try {
        return this.normalizeAbsoluteUrl(value, 'url');
      } catch {
        return undefined;
      }
    }
  }
};
