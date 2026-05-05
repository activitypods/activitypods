const crypto = require('crypto');
const net = require('net');
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
  '*/*;q=0.1'
].join(', ');

const PROFILE_ACCEPT_HEADER = [
  'image/avif',
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/*;q=0.8',
  '*/*;q=0.1'
].join(', ');

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime'
]);

const ALLOWED_PROFILE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

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
  if (sniffedMime && headerMime && headerMime !== 'application/octet-stream' && sniffedMime !== headerMime) {
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
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return 'image/png';
  // GIF
  if (b.length >= 6) {
    const sig = b.subarray(0, 6).toString('ascii');
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
  }
  // WebP
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP')
    return 'image/webp';
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
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return 'image/png';
  if (b.length >= 6) {
    const sig = b.subarray(0, 6).toString('ascii');
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
  }
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP')
    return 'image/webp';
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
      signal: AbortSignal.timeout(20_000)
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
    size: bytes.byteLength
  };
}

const RECIPIENT_FIELDS = ['to', 'cc', 'bto', 'bcc'];

// Limit concurrent remote actor resolution to avoid overwhelming the remote-fetch pool
const MAX_CONCURRENT_RESOLUTIONS = 10;

module.exports = {
  name: 'internal-activitypub-bridge-api',

  dependencies: ['api', 'activitypub.actor', 'followable'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
    },
    routePath: '/api/internal/activitypub-bridge',
    maxRecipientUris: Number(process.env.AP_BRIDGE_MAX_RECIPIENT_URIS || 1000),
    maxDeliveries: Number(process.env.AP_BRIDGE_MAX_DELIVERIES || 500),
    maxActivityBytes: Number(process.env.AP_BRIDGE_MAX_ACTIVITY_BYTES || 262144),
    localInboxOrigins: String(process.env.AP_BRIDGE_LOCAL_INBOX_ORIGINS || '')
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
          'POST /resolve-profile-media': 'internal-activitypub-bridge-api.resolveProfileMedia',
          'POST /inbox/receive': 'internal-activitypub-bridge-api.receiveInbound'
        }
      },
      toBottom: false
    });

    this.logger.info(
      '[ActivityPubBridgeApi] Internal routes registered under /api/internal/activitypub-bridge: resolve-outbound, resolve-media, resolve-profile-media, inbox/receive'
    );
  },

  actions: {
    receiveInbound: {
      async handler(ctx) {
        const { targetInbox, activity, verifiedActorUri, receivedAt, remoteIp, benchmark } = ctx.params || {};
        const benchmarkMode = this.parseBooleanLike(benchmark);

        const normalizedTargetInbox = this.normalizeTrustedInboxUrl(targetInbox);
        if (!normalizedTargetInbox) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'targetInbox must be a trusted local inbox URL' };
        }
        if (!activity || typeof activity !== 'object' || Array.isArray(activity)) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'activity is required' };
        }
        const activityBytes = Buffer.byteLength(JSON.stringify(activity), 'utf8');
        if (activityBytes > this.settings.maxActivityBytes) {
          ctx.meta.$statusCode = 413;
          return { error: 'payload_too_large', message: `activity exceeds ${this.settings.maxActivityBytes} bytes` };
        }
        if (!verifiedActorUri || typeof verifiedActorUri !== 'string') {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'verifiedActorUri is required' };
        }
        if (!Number.isFinite(receivedAt) || receivedAt <= 0) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'receivedAt must be a number (timestamp)' };
        }
        if (!remoteIp || typeof remoteIp !== 'string' || net.isIP(remoteIp.trim()) === 0) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'remoteIp is required' };
        }

        const activityActorUri = this.extractActivityActorUri(activity);
        if (!activityActorUri || activityActorUri !== verifiedActorUri) {
          ctx.meta.$statusCode = 400;
          return { error: 'actor_mismatch', message: 'activity.actor does not match verifiedActorUri' };
        }

        this.logger.info(
          `[ActivityPubBridgeApi] ${activity.type || 'Activity'} from ${verifiedActorUri} -> ${normalizedTargetInbox}`,
          { activityId: activity.id, remoteIpHash: this.hashRemoteIp(remoteIp) }
        );

        try {
          await ctx.call(
            'activitypub.inbox.post',
            { collectionUri: normalizedTargetInbox, ...activity },
            { meta: { webId: verifiedActorUri, skipSignatureValidation: true } }
          );
          ctx.meta.$statusCode = 202;
          return { success: true };
        } catch (err) {
          if (benchmarkMode && this.isMissingInboxOwnerError(err)) {
            this.logger.warn('[ActivityPubBridgeApi] Benchmark inbound accepted despite missing inbox owner', {
              activityId: activity.id,
              targetInbox: normalizedTargetInbox
            });
            ctx.meta.$statusCode = 202;
            return { success: true, benchmarkAccepted: true, reason: 'not_found' };
          }

          this.logger.error('[ActivityPubBridgeApi] Failed to deliver inbound activity', {
            error: err.message,
            activityId: activity.id,
            targetInbox: normalizedTargetInbox
          });

          if (err.code === 404 || err.type === 'NOT_FOUND') {
            ctx.meta.$statusCode = 404;
            return { success: false, error: 'not_found', message: err.message };
          }

          ctx.meta.$statusCode = 500;
          return { success: false, error: 'processing_error', message: err.message };
        }
      }
    },

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

        const deliveries = this.isFollowActivity(activity)
          ? await this.resolveFollowDeliveries(ctx, actorUri, activity)
          : await this.resolveRemoteDeliveries(ctx, this.extractRecipientUris(activity));

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
            label: 'attachment media'
          });
          ctx.meta.$statusCode = 200;
          return { ...result, resolvedAt: new Date().toISOString() };
        } catch (err) {
          const code = err.code || 'processing_error';
          const statusCode = err.statusCode || 500;
          if (statusCode < 500) {
            this.logger.warn('[ActivityPubBridgeApi] Attachment media resolution rejected', {
              mediaUrl,
              code,
              error: err.message
            });
          } else {
            this.logger.error('[ActivityPubBridgeApi] Unexpected attachment media resolution failure', {
              mediaUrl,
              error: err.message
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
            label: 'profile media'
          });
          ctx.meta.$statusCode = 200;
          return { ...result, resolvedAt: new Date().toISOString() };
        } catch (err) {
          const code = err.code || 'processing_error';
          const statusCode = err.statusCode || 500;
          if (statusCode < 500) {
            this.logger.warn('[ActivityPubBridgeApi] Profile media resolution rejected', {
              mediaUrl,
              code,
              error: err.message
            });
          } else {
            this.logger.error('[ActivityPubBridgeApi] Unexpected profile media resolution failure', {
              mediaUrl,
              error: err.message
            });
          }
          ctx.meta.$statusCode = statusCode;
          return { error: code, message: err.message };
        }
      }
    }
  },

  methods: {
    isMissingInboxOwnerError(err) {
      if (!err) return false;
      if (err.code === 404 || err.type === 'NOT_FOUND') return true;
      const message = String(err.message || '');
      if (/dataset\s+.+\s+doesn't\s+exist/i.test(message)) return true;
      if (/owner\s+.*\s+not\s+found/i.test(message)) return true;
      if (/inbox\s+.*\s+not\s+found/i.test(message)) return true;
      return false;
    },

    parseBooleanLike(value) {
      if (value === true || value === 1) return true;
      if (typeof value !== 'string') return false;
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    },

    extractActivityActorUri(activity) {
      if (typeof activity?.actor === 'string' && activity.actor.length > 0) {
        return activity.actor;
      }

      if (
        activity?.actor &&
        typeof activity.actor === 'object' &&
        typeof activity.actor.id === 'string' &&
        activity.actor.id.length > 0
      ) {
        return activity.actor.id;
      }

      return null;
    },

    hashRemoteIp(remoteIp) {
      return crypto
        .createHash('sha256')
        .update(String(remoteIp || ''), 'utf8')
        .digest('hex')
        .slice(0, 16);
    },

    getAllowedInboxOrigins() {
      const fromEnv = String(this.settings.localInboxOrigins || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

      const defaults = [
        process.env.ACTIVITYPODS_URL,
        process.env.SEMAPPS_HOME_URL,
        'http://localhost:3000',
        'https://localhost:3000'
      ]
        .map(value => String(value || '').trim())
        .filter(Boolean);

      const allowed = new Set();
      for (const origin of [...defaults, ...fromEnv]) {
        try {
          const parsed = new URL(origin);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            allowed.add(parsed.origin);
          }
        } catch {
          // Ignore malformed origins.
        }
      }

      return allowed;
    },

    normalizeTrustedInboxUrl(value) {
      const normalized = String(value || '').trim();
      if (!normalized) return null;

      let parsed;
      try {
        parsed = new URL(normalized);
      } catch {
        return null;
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      if (!parsed.pathname.endsWith('/inbox')) return null;

      const allowedOrigins = this.getAllowedInboxOrigins();
      if (!allowedOrigins.has(parsed.origin)) return null;

      return parsed.toString();
    },

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
      // Reject if lengths differ (fail fast without timing info leakage)
      if (exp.length !== got.length) return false;
      // Compare content in constant time
      return crypto.timingSafeEqual(exp, got);
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
    },

    isFollowActivity(activity) {
      const type = activity?.type || activity?.['@type'];
      return type === 'Follow';
    },

    async resolveFollowDeliveries(ctx, actorUri, activity) {
      const resolved = await ctx.call('followable.resolveFollowActivityDelivery', {
        activity,
        recursionLimit: 1,
        requireFollowersCollection: true,
        webId: 'system'
      });

      if (this.isLikelyLocalDelivery(actorUri, resolved.delivery)) {
        return [];
      }

      return [resolved.delivery];
    },

    isLikelyLocalDelivery(actorUri, delivery) {
      try {
        const actorOrigin = new URL(actorUri).origin;
        const inboxOrigin = new URL(delivery.recipients[0]).origin;
        return actorOrigin === inboxOrigin;
      } catch {
        return false;
      }
    }
  }
};
