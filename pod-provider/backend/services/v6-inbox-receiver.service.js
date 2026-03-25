"use strict";

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
        onBeforeCall(ctx, route, req) {
          const authHeader = req.headers["authorization"] || "";
          const [scheme, token] = authHeader.split(" ");
          if (scheme !== "Bearer" || !sidecarToken || token !== sidecarToken) {
            throw new E.UnAuthorizedError(E.ERR_NO_TOKEN, null, "Invalid sidecar token");
          }
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
      if (!targetInbox || typeof targetInbox !== "string") {
        ctx.meta.$statusCode = 400;
        return { error: "invalid_request", message: "targetInbox is required" };
      }
      if (!activity || typeof activity !== "object") {
        ctx.meta.$statusCode = 400;
        return { error: "invalid_request", message: "activity is required" };
      }
      if (!verifiedActorUri || typeof verifiedActorUri !== "string") {
        ctx.meta.$statusCode = 400;
        return { error: "invalid_request", message: "verifiedActorUri is required" };
      }
      if (!receivedAt || typeof receivedAt !== "number") {
        ctx.meta.$statusCode = 400;
        return { error: "invalid_request", message: "receivedAt must be a number (timestamp)" };
      }
      if (!remoteIp || typeof remoteIp !== "string") {
        ctx.meta.$statusCode = 400;
        return { error: "invalid_request", message: "remoteIp is required" };
      }

      // Actor in the activity must match the verified actor
      if (activity.actor !== verifiedActorUri) {
        ctx.meta.$statusCode = 400;
        return { error: "actor_mismatch", message: "activity.actor does not match verifiedActorUri" };
      }

      this.logger.info(
        `[SidecarInbox] ${activity.type} from ${verifiedActorUri} → ${targetInbox}`,
        { activityId: activity.id, remoteIp }
      );

      try {
        // activitypub.inbox.post destructures { collectionUri, ...activity } from params.
        // Setting skipSignatureValidation skips the HTTP-sig re-check — the sidecar
        // already verified it. Setting webId = verifiedActorUri satisfies the
        // actor === webId guard inside inbox.post.
        await ctx.call(
          "activitypub.inbox.post",
          { collectionUri: targetInbox, ...activity },
          { meta: { webId: verifiedActorUri, skipSignatureValidation: true } }
        );

        ctx.meta.$statusCode = 202;
        return { success: true };
      } catch (err) {
        this.logger.error("[SidecarInbox] Failed to deliver activity", {
          error: err.message,
          activityId: activity.id,
          targetInbox,
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
};
