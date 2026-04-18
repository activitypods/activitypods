"use strict";

const crypto = require("crypto");
const net = require("net");

/**
 * Sidecar Inbox Receiver — Moleculer Service
 *
 * Receives verified inbound activities from the fedify-sidecar and forwards
 * them to ActivityPods via activitypub.inbox.post.
 *
 * The sidecar has already verified the HTTP signature, so we skip
 * signature validation and trust the verifiedActorUri.
 *
 * Route: POST /api/internal/inbox/receive
 * Auth:  Bearer ${SIDECAR_TOKEN}  (same secret as ACTIVITYPODS_TOKEN on sidecar)
 */

const { Errors: E } = require("moleculer-web");

module.exports = {
  name: "sidecar.inbox-receiver",

  dependencies: ["api"],

  settings: {
    // Must match ACTIVITYPODS_TOKEN in the sidecar's environment
    sidecarToken: process.env.SIDECAR_TOKEN || "",
    maxActivityBytes: Number(process.env.AP_BRIDGE_MAX_ACTIVITY_BYTES || 262144),
    localInboxOrigins: String(process.env.AP_BRIDGE_LOCAL_INBOX_ORIGINS || ""),
  },

  async started() {
    const sidecarToken = this.settings.sidecarToken;

    if (!sidecarToken) {
      this.logger.warn("[SidecarInbox] SIDECAR_TOKEN is not set — all requests will be rejected");
    }

    // api.addRoute is a local call — functions survive without serialization
    await this.broker.call("api.addRoute", {
      route: {
        path: "/api/internal/inbox",
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        onBeforeCall: (ctx, route, req) => {
          const authHeader = (req.headers["authorization"] || "").trim();
          const token = this.parseBearerToken(authHeader);
          if (!this.safeTokenEquals(sidecarToken, token)) {
            throw new E.UnAuthorizedError(E.ERR_NO_TOKEN, null, "Invalid sidecar token");
          }

          ctx.meta.$responseHeaders = {
            ...(ctx.meta.$responseHeaders || {}),
            "Cache-Control": "no-store",
            Pragma: "no-cache",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
          };
        },
        aliases: {
          "POST /receive": "sidecar.inbox-receiver.receive",
        },
      },
    });

    this.logger.info("[SidecarInbox] Route POST /api/internal/inbox/receive registered");
  },

  actions: {
    /**
     * Receive a verified inbound activity from the sidecar.
     *
     * Params: { targetInbox, activity, verifiedActorUri, receivedAt, remoteIp }
     */
    async receive(ctx) {
      const { targetInbox, activity, verifiedActorUri, receivedAt, remoteIp } = ctx.params;

      // Validate required fields
      const normalizedTargetInbox = this.normalizeTrustedInboxUrl(targetInbox);
      if (!normalizedTargetInbox) {
        ctx.meta.$statusCode = 400;
        return { error: "invalid_request", message: "targetInbox must be a trusted local inbox URL" };
      }
      if (!activity || typeof activity !== "object" || Array.isArray(activity)) {
        ctx.meta.$statusCode = 400;
        return { error: "invalid_request", message: "activity is required" };
      }
      const activityBytes = Buffer.byteLength(JSON.stringify(activity), "utf8");
      if (activityBytes > this.settings.maxActivityBytes) {
        ctx.meta.$statusCode = 413;
        return { error: "payload_too_large", message: `activity exceeds ${this.settings.maxActivityBytes} bytes` };
      }
      if (!verifiedActorUri || typeof verifiedActorUri !== "string") {
        ctx.meta.$statusCode = 400;
        return { error: "invalid_request", message: "verifiedActorUri is required" };
      }
      if (!Number.isFinite(receivedAt) || receivedAt <= 0) {
        ctx.meta.$statusCode = 400;
        return { error: "invalid_request", message: "receivedAt must be a number (timestamp)" };
      }
      if (!remoteIp || typeof remoteIp !== "string" || net.isIP(remoteIp.trim()) === 0) {
        ctx.meta.$statusCode = 400;
        return { error: "invalid_request", message: "remoteIp is required" };
      }

      // Actor in the activity must match the verified actor
      const activityActorUri = this.extractActivityActorUri(activity);
      if (!activityActorUri || activityActorUri !== verifiedActorUri) {
        ctx.meta.$statusCode = 400;
        return { error: "actor_mismatch", message: "activity.actor does not match verifiedActorUri" };
      }

      this.logger.info(
        `[SidecarInbox] ${activity.type} from ${verifiedActorUri} -> ${normalizedTargetInbox}`,
        { activityId: activity.id, remoteIpHash: this.hashRemoteIp(remoteIp) }
      );

      try {
        // activitypub.inbox.post destructures { collectionUri, ...activity } from params.
        // Setting skipSignatureValidation skips the HTTP-sig re-check — the sidecar
        // already verified it. Setting webId = verifiedActorUri satisfies the
        // actor === webId guard inside inbox.post.
        await ctx.call(
          "activitypub.inbox.post",
          { collectionUri: normalizedTargetInbox, ...activity },
          { meta: { webId: verifiedActorUri, skipSignatureValidation: true } }
        );

        ctx.meta.$statusCode = 202;
        return { success: true };
      } catch (err) {
        this.logger.error("[SidecarInbox] Failed to deliver activity", {
          error: err.message,
          activityId: activity.id,
          targetInbox: normalizedTargetInbox,
        });

        if (err.code === 404 || err.type === "NOT_FOUND") {
          ctx.meta.$statusCode = 404;
          return { success: false, error: "not_found", message: err.message };
        }

        ctx.meta.$statusCode = 500;
        return { success: false, error: "processing_error", message: err.message };
      }
    },
  },

  methods: {
    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== "string") return null;
      const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
      if (!match) return null;
      return match[1];
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      const exp = Buffer.from(String(expected), "utf8");
      const got = Buffer.from(String(provided), "utf8");
      const maxLen = Math.max(exp.length, got.length);
      const expPadded = Buffer.alloc(maxLen, 0);
      const gotPadded = Buffer.alloc(maxLen, 0);
      exp.copy(expPadded);
      got.copy(gotPadded);
      return exp.length === got.length && crypto.timingSafeEqual(expPadded, gotPadded);
    },

    extractActivityActorUri(activity) {
      if (typeof activity?.actor === "string" && activity.actor.length > 0) {
        return activity.actor;
      }

      if (
        activity?.actor &&
        typeof activity.actor === "object" &&
        typeof activity.actor.id === "string" &&
        activity.actor.id.length > 0
      ) {
        return activity.actor.id;
      }

      return null;
    },

    hashRemoteIp(remoteIp) {
      return crypto.createHash("sha256").update(String(remoteIp || ""), "utf8").digest("hex").slice(0, 16);
    },

    getAllowedInboxOrigins() {
      const fromEnv = String(this.settings.localInboxOrigins || "")
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);

      const defaults = [
        process.env.ACTIVITYPODS_URL,
        process.env.SEMAPPS_HOME_URL,
        "http://localhost:3000",
        "https://localhost:3000",
      ]
        .map(value => String(value || "").trim())
        .filter(Boolean);

      const allowed = new Set();
      for (const origin of [...defaults, ...fromEnv]) {
        try {
          const parsed = new URL(origin);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            allowed.add(parsed.origin);
          }
        } catch {
          // Ignore malformed origins.
        }
      }
      return allowed;
    },

    normalizeTrustedInboxUrl(value) {
      const normalized = String(value || "").trim();
      if (!normalized) return null;

      let parsed;
      try {
        parsed = new URL(normalized);
      } catch {
        return null;
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      if (!parsed.pathname.endsWith("/inbox")) return null;

      const allowedOrigins = this.getAllowedInboxOrigins();
      if (!allowedOrigins.has(parsed.origin)) return null;

      return parsed.toString();
    },
  },
};
