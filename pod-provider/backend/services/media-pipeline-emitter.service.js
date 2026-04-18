"use strict";

/**
 * ActivityPods Media Pipeline Emitter
 *
 * Staged Moleculer service for the ActivityPods backend. It listens for local
 * file-resource creation events and forwards eligible media resources to the
 * media-pipeline-sidecar ingress endpoint.
 *
 * This keeps media processing off the request path while preserving a simple
 * "pod owns canonical blob, sidecar owns derivatives and analysis" boundary.
 */

const SEMAPPS_FILE_TYPES = new Set([
  "semapps:File",
  "http://semapps.org/ns/core#File",
  "https://semapps.org/ns/core#File",
]);

module.exports = {
  name: "media-pipeline-emitter",

  settings: {
    enabled: process.env.MEDIA_PIPELINE_ENABLED !== "false",
    includeUpdates: process.env.MEDIA_PIPELINE_INCLUDE_UPDATES === "true",
    mediaPipelineIngressUrl:
      process.env.MEDIA_PIPELINE_INGRESS_URL ||
      "http://media-pipeline-sidecar:8090/internal/media/ingest",
    mediaPipelineToken: process.env.MEDIA_PIPELINE_TOKEN || "",
    requestTimeoutMs: Number(process.env.MEDIA_PIPELINE_TIMEOUT_MS) || 5000,
    retries: Number(process.env.MEDIA_PIPELINE_RETRIES) || 3,
  },

  async started() {
    if (!this.settings.enabled) {
      this.logger.info("[MediaPipelineEmitter] Disabled by MEDIA_PIPELINE_ENABLED=false");
      return;
    }

    if (!this.settings.mediaPipelineToken) {
      this.logger.warn("[MediaPipelineEmitter] MEDIA_PIPELINE_TOKEN is not set; media ingest calls will be skipped");
    }

    this.logger.info("[MediaPipelineEmitter] Ready", {
      includeUpdates: this.settings.includeUpdates,
      mediaPipelineIngressUrl: this.settings.mediaPipelineIngressUrl,
    });
  },

  events: {
    "ldp.resource.created": {
      async handler(ctx) {
        if (!this.settings.enabled) {
          return;
        }

        await this.forwardIfEligible({
          eventName: "ldp.resource.created",
          resourceUri: ctx.params?.resourceUri,
          resource: ctx.params?.newData,
          webId: ctx.params?.webId || ctx.meta?.webId || null,
          dataset: ctx.params?.dataset || ctx.meta?.dataset || null,
        });
      },
    },

    "ldp.resource.updated": {
      async handler(ctx) {
        if (!this.settings.enabled || !this.settings.includeUpdates) {
          return;
        }

        await this.forwardIfEligible({
          eventName: "ldp.resource.updated",
          resourceUri: ctx.params?.resourceUri,
          resource: ctx.params?.newData,
          webId: ctx.params?.webId || ctx.meta?.webId || null,
          dataset: ctx.params?.dataset || ctx.meta?.dataset || null,
        });
      },
    },
  },

  methods: {
    async forwardIfEligible({ eventName, resourceUri, resource, webId, dataset }) {
      const normalizedResourceUri = normalizeAbsoluteUrl(resourceUri);
      if (!normalizedResourceUri || !isEligibleMediaResource(normalizedResourceUri, resource)) {
        return;
      }

      if (!this.settings.mediaPipelineToken) {
        return;
      }

      const ownerId = extractOwnerId({ resource, webId, dataset, resourceUri: normalizedResourceUri });
      const alt = extractFirstString(resource, ["alt", "name", "title"]);
      const contentWarning = extractFirstString(resource, ["contentWarning", "summary"]);
      const isSensitive = extractBoolean(resource, ["isSensitive", "sensitive"]);

      const body = JSON.stringify({
        sourceUrl: normalizedResourceUri,
        ownerId,
        sourceResolver: "activitypods-file",
        alt: alt || undefined,
        contentWarning: contentWarning || undefined,
        isSensitive,
      });

      try {
        await this.retryWithBackoff(async () => {
          const response = await fetch(this.settings.mediaPipelineIngressUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${this.settings.mediaPipelineToken}`,
            },
            body,
            signal: AbortSignal.timeout(this.settings.requestTimeoutMs),
          });

          if (response.ok) {
            this.logger.debug("[MediaPipelineEmitter] Queued media ingest", {
              eventName,
              resourceUri: normalizedResourceUri,
              ownerId,
            });
            return;
          }

          const error = new Error(`Media pipeline ingress returned HTTP ${response.status}`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        });
      } catch (error) {
        this.logger.error("[MediaPipelineEmitter] Failed to enqueue media resource", {
          eventName,
          resourceUri: normalizedResourceUri,
          ownerId,
          error: error?.message || String(error),
        });
      }
    },

    async retryWithBackoff(fn) {
      const maxRetries = Math.max(0, this.settings.retries - 1);

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          await fn();
          return;
        } catch (error) {
          const retryable = error?.retryable !== false;
          if (!retryable || attempt >= maxRetries) {
            throw error;
          }

          const capMs = 10_000;
          const baseDelayMs = 250;
          const maxDelayMs = Math.min(capMs, baseDelayMs * 2 ** attempt);
          const delayMs = Math.floor(Math.random() * Math.max(1, maxDelayMs));
          await sleep(delayMs);
        }
      }
    },
  },
};

function isEligibleMediaResource(resourceUri, resource) {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    return false;
  }

  const mimeType = extractMimeType(resource);
  if (mimeType && !isSupportedMediaMime(mimeType)) {
    return false;
  }

  const types = normalizeTypes(resource);
  if (types.some((type) => SEMAPPS_FILE_TYPES.has(type))) {
    return true;
  }

  try {
    const parsed = new URL(resourceUri);
    return /\/files(?:\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function extractOwnerId({ resource, webId, dataset, resourceUri }) {
  const attributedTo = extractFirstString(resource, ["attributedTo", "owner", "creator"]);
  return attributedTo || webId || dataset || resourceUri;
}

function extractMimeType(resource) {
  return normalizeMimeType(
    extractFirstString(resource, [
      "mediaType",
      "dcat:mediaType",
      "dc:format",
      "mimeType",
    ]),
  );
}

function isSupportedMediaMime(mimeType) {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

function normalizeTypes(resource) {
  const raw = resource?.type ?? resource?.["@type"];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function extractFirstString(resource, keys) {
  for (const key of keys) {
    const raw = resource?.[key];
    const value = extractStringValue(raw);
    if (value) {
      return value;
    }
  }
  return "";
}

function extractStringValue(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = extractStringValue(item);
      if (normalized) {
        return normalized;
      }
    }
  }

  return "";
}

function extractBoolean(resource, keys) {
  for (const key of keys) {
    const raw = resource?.[key];
    if (typeof raw === "boolean") {
      return raw;
    }
    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
  }
  return undefined;
}

function normalizeAbsoluteUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeMimeType(value) {
  if (!value) {
    return "";
  }
  return value.split(";")[0].trim().toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
