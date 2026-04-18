// services/signing.service.js
// ActivityPods Signing Service - Formal Contract Implementation
// Implements signing.signHttpRequestsBatch as per Fediverse interop baseline (Cavage-style HTTP Signatures)
"use strict";

require("dotenv-flow").config();

const crypto = require("crypto");
const { URL } = require("url");
const { MoleculerError } = require("moleculer").Errors;

// ============================================================================
// Utility Functions
// ============================================================================

function toHttpDate(d = new Date()) {
  return d.toUTCString(); // IMF-fixdate format
}

function assertHost(host) {
  if (!host || typeof host !== "string") return false;
  if (host.includes("://")) return false;
  if (host.includes("/")) return false;
  if (/\s/.test(host)) return false;
  return true;
}

function assertPath(path) {
  return typeof path === "string" && path.startsWith("/");
}

function sha256Base64(buf) {
  return crypto.createHash("sha256").update(buf).digest("base64");
}

function digestHeaderFromBytes(buf) {
  return `SHA-256=${sha256Base64(buf)}`;
}

function normalizeMethod(m) {
  return String(m || "").toUpperCase();
}

function buildRequestTarget(method, path, query) {
  const q = query ? String(query) : "";
  const qp = q ? (q.startsWith("?") ? q : `?${q}`) : "";
  return `${method.toLowerCase()} ${path}${qp}`;
}

/**
 * Build the Cavage-style signing string from covered headers.
 * Header names MUST be lowercase; order MUST match headers="..." parameter.
 */
function buildSigningString({ requestTarget, host, date, digest, contentType }, signedHeaders) {
  const lines = [];
  for (const h of signedHeaders) {
    const hl = h.toLowerCase();
    if (hl === "(request-target)") lines.push(`(request-target): ${requestTarget}`);
    else if (hl === "host") lines.push(`host: ${host}`);
    else if (hl === "date") lines.push(`date: ${date}`);
    else if (hl === "digest") lines.push(`digest: ${digest}`);
    else if (hl === "content-type") lines.push(`content-type: ${contentType}`);
    else {
      // Fail closed: don't sign unknown headers by accident
      throw new Error(`PROFILE_INVALID: unsupported signed header: ${h}`);
    }
  }
  return lines.join("\n");
}

function signRsaSha256(privateKeyPem, signingString) {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingString);
  signer.end();
  return signer.sign(privateKeyPem, "base64");
}

// ============================================================================
// secp256k1 (ATProto) Utilities
// ============================================================================

// secp256k1 group order n — used for low-S normalization (ATProto requirement)
const SECP256K1_N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);

// Multicodec varint prefix for secp256k1-pub (0xe7 = 231 in varint → [0xe7, 0x01])
const SECP256K1_MULTICODEC = Buffer.from([0xe7, 0x01]);

const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Convert a DER-encoded ECDSA signature to compact (IEEE P1363) 64-byte format
 * and normalize s to low-S as required by ATProto.
 * DER layout: 0x30 <totalLen> 0x02 <rLen> <r…> 0x02 <sLen> <s…>
 */
function derToCompact(derBuf) {
  let offset = 2; // skip 0x30 + total-length byte
  if (derBuf[offset++] !== 0x02) throw new Error("DER: expected 0x02 for r");
  const rLen = derBuf[offset++];
  const rBytes = derBuf.slice(offset, offset + rLen);
  offset += rLen;
  if (derBuf[offset++] !== 0x02) throw new Error("DER: expected 0x02 for s");
  const sLen = derBuf[offset++];
  const sBytes = derBuf.slice(offset, offset + sLen);

  // Normalize each scalar to exactly 32 bytes.
  // DER may prefix a 0x00 sign byte, which makes length 33.
  const to32 = bytes => {
    if (bytes.length === 32) return Buffer.from(bytes);
    if (bytes.length > 32) return bytes.slice(bytes.length - 32);
    const out = Buffer.alloc(32);
    bytes.copy(out, 32 - bytes.length);
    return out;
  };
  const r = to32(rBytes);
  const s = to32(sBytes);

  // Low-S normalization: if s > n/2, replace with n - s
  const sInt = BigInt("0x" + s.toString("hex"));
  let finalS = s;
  if (sInt > SECP256K1_N >> 1n) {
    const lowS = SECP256K1_N - sInt;
    finalS = Buffer.from(lowS.toString(16).padStart(64, "0"), "hex");
  }

  return Buffer.concat([r, finalS]);
}

/**
 * Encode a Buffer as base58 (Bitcoin alphabet, no checksum).
 */
function toBase58(buf) {
  if (buf.length === 0) return "";
  let num = BigInt("0x" + buf.toString("hex"));
  let result = "";
  while (num > 0n) {
    result = BASE58_CHARS[Number(num % 58n)] + result;
    num /= 58n;
  }
  for (let i = 0; i < buf.length && buf[i] === 0; i++) {
    result = "1" + result;
  }
  return result;
}

/**
 * Encode a secp256k1 compressed public key (33 bytes) as multibase base58btc.
 * Format: 'z' + base58( [0xe7, 0x01] + compressedKey )
 * This is the did:key / ATProto standard for secp256k1 public keys.
 */
function secp256k1PubkeyToMultibase(compressedKeyBytes) {
  return "z" + toBase58(Buffer.concat([SECP256K1_MULTICODEC, compressedKeyBytes]));
}

/**
 * Given a PEM-encoded EC public key, return the 33-byte compressed point.
 * Node exports SPKI DER with an uncompressed 65-byte point (0x04 x y).
 * Compression: prefix 0x02 (y even) or 0x03 (y odd) + x.
 */
function getCompressedPublicKey(publicKeyPem) {
  const pubKey = crypto.createPublicKey(publicKeyPem);
  const der = pubKey.export({ type: "spki", format: "der" });
  // Last 65 bytes of SPKI DER for an uncompressed EC point are 0x04 + x(32) + y(32)
  const raw = der.slice(-65);
  if (raw[0] !== 0x04) throw new Error("Expected uncompressed EC point (0x04 prefix)");
  const x = raw.slice(1, 33);
  const y = raw.slice(33, 65);
  const prefix = (y[31] & 1) === 0 ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), x]);
}

/**
 * Sign arbitrary bytes with a secp256k1 private key.
 * Returns the compact signature as a base64url string (ATProto wire format).
 */
function signSecp256k1(privateKeyPem, dataBytes) {
  const signer = crypto.createSign("SHA256");
  signer.update(dataBytes);
  signer.end();
  const derSig = signer.sign(privateKeyPem);
  const compact = derToCompact(derSig);
  return compact.toString("base64url");
}

// ============================================================================
// Moleculer Service
// ============================================================================

module.exports = {
  name: "signing",

  // "actors" intentionally omitted: only used by signHttpRequestsBatch, not AT endpoints
  dependencies: ["api", "keys", "activitypub.actor", "identitybindings", "auth.account"],

  async started() {
    // Register all internal signing endpoints with the API Gateway.
    // Bearer token auth is enforced inside each handler via this._auth(ctx).
    await this.broker.call("api.addRoute", {
      route: {
        name: "signing-internal",
        path: "/api/internal",
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: this.settings.limits.maxBodyBytes } },
        onBeforeCall(ctx, route, req) {
          ctx.meta.$headers = req.headers;
        },
        aliases: {
          "POST /signatures/batch":    "signing.signHttpRequestsBatch",
          "POST /atproto/provision":   "signing.provisionAtprotoIdentity",
          "POST /atproto/commit-sign": "signing.signAtprotoCommit",
          "POST /atproto/plc-sign":    "signing.signAtprotoPlcOp",
          "GET  /atproto/public-key":  "signing.getAtprotoPublicKey",
        },
      },
      toBottom: false,
    });

    await this.broker.call("api.addRoute", {
      route: {
        name: "auth-internal",
        path: "/api/internal/auth",
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        onBeforeCall(ctx, route, req) {
          ctx.meta.$headers = req.headers;
        },
        aliases: {
          "POST /verify": "signing.verifyInternalPassword",
        },
      },
      toBottom: false,
    });

    this.logger.info("[Signing] Internal signing routes registered under /api/internal");
  },

  settings: {
    auth: {
      // Must match ACTIVITYPODS_TOKEN in the sidecar's environment.
      // Both sides MUST reference the same shared secret value.
      bearerToken:
        process.env.ACTIVITYPODS_TOKEN ||
        process.env.SIDECAR_TOKEN ||
        "test-atproto-signing-token-local",
      // Strong recommendation: also enforce mTLS at the reverse proxy / mesh
    },
    limits: {
      maxBatch: Number(process.env.SIGNING_MAX_BATCH || 500),
      maxBodyBytes: Number(process.env.SIGNING_MAX_BODY_BYTES || 512 * 1024),
      maxClockSkewSeconds: Number(process.env.SIGNING_MAX_SKEW_SECONDS || 300),
    },
    // Signing profiles aligned with Fediverse practice (GoToSocial/Mastodon baseline)
    profiles: {
      ap_get_v1: {
        algorithm: "rsa-sha256",
        signedHeaders: ["(request-target)", "host", "date"],
        requireDigest: false,
        signContentType: false,
      },
      ap_post_v1: {
        algorithm: "rsa-sha256",
        signedHeaders: ["(request-target)", "host", "date", "digest"],
        requireDigest: true,
        signContentType: false,
      },
      ap_post_v1_ct: {
        algorithm: "rsa-sha256",
        signedHeaders: ["(request-target)", "host", "date", "digest", "content-type"],
        requireDigest: true,
        signContentType: true,
      },
    },
  },

  actions: {
    /**
     * Batch sign HTTP requests for ActivityPub federation.
     * 
     * This is the formal contract endpoint that allows the Fedify sidecar to
     * request signatures for outbound HTTP requests while keeping all private
     * keys inside ActivityPods.
     * 
     * @param {Object} ctx - Moleculer context
     * @param {Array} ctx.params.requests - Array of signing requests
     * @returns {Object} Results with signed headers or errors per request
     */
    signHttpRequestsBatch: {
      rest: {
        method: "POST",
        path: "/api/internal/signatures/batch",
      },
      params: {
        requests: { type: "array", min: 1 },
        options: {
          type: "object",
          optional: true,
          props: {
            maxPerBatch: { type: "number", optional: true },
            failClosedIfActorUnknown: { type: "boolean", optional: true, default: true },
          },
        },
      },

      async handler(ctx) {
        this._auth(ctx);

        const reqs = ctx.params.requests;
        if (reqs.length > this.settings.limits.maxBatch) {
          return {
            results: reqs.map(r => ({
              requestId: r?.requestId,
              ok: false,
              error: {
                code: "INVALID_INPUT",
                message: `maxBatch=${this.settings.limits.maxBatch} exceeded`,
                retryable: false,
              },
            })),
          };
        }

        // Group by actor for key reuse + locality checks
        const byActor = new Map();
        for (const r of reqs) {
          const a = r?.actorUri || "";
          if (!byActor.has(a)) byActor.set(a, []);
          byActor.get(a).push(r);
        }

        const results = [];

        for (const [actorUri, items] of byActor) {
          // Validate local actor (authority boundary enforcement)
          const locality = await this._validateLocalActor(ctx, actorUri);
          if (!locality.ok) {
            for (const r of items) {
              results.push(this._err(r, locality.error, locality.message, false));
            }
            continue;
          }

          // Resolve private key (authority remains here - keys never leave ActivityPods)
          let keyPair;
          try {
            // Resolve actorUri -> webId if they differ in your stack
            const webId = await ctx.call("actors.resolveWebIdForActor", { actorUri });
            keyPair = await ctx.call("keys.getOrCreateWebIdKeys", { webId });
          } catch (e) {
            for (const r of items) {
              results.push(this._err(r, "KEY_UNAVAILABLE", e?.message || "key lookup failed", true));
            }
            continue;
          }

          if (!keyPair?.privateKey) {
            for (const r of items) {
              results.push(this._err(r, "KEY_UNAVAILABLE", "privateKey missing", true));
            }
            continue;
          }

          // Resolve keyId authoritatively (signer-controlled, NOT hardcoded by caller)
          let keyId;
          try {
            keyId = await ctx.call("actors.getPublicKeyId", { actorUri });
          } catch (e) {
            for (const r of items) {
              results.push(this._err(r, "KEY_UNAVAILABLE", e?.message || "keyId lookup failed", true));
            }
            continue;
          }

          // Sign each request in this actor's batch
          for (const r of items) {
            results.push(await this._signOne(ctx, actorUri, keyId, keyPair.privateKey, r));
          }
        }

        return { results };
      },
    },

    // =========================================================================
    // ATProto Signing Actions (V6.5 extensions)
    // =========================================================================

    provisionAtprotoIdentity: {
      rest: {
        method: "POST",
        path: "/api/internal/atproto/provision",
      },
      params: {
        canonicalAccountId: { type: "string", min: 1 },
        webId: { type: "string", optional: true },
        did: { type: "string", optional: true },
        handle: { type: "string", optional: true },
      },

      async handler(ctx) {
        this._auth(ctx);

        const canonicalAccountId = ctx.params.canonicalAccountId;
        const webId = ctx.params.webId || canonicalAccountId;
        const slug = new URL(webId).pathname.split("/").filter(Boolean).pop() || "account";
        const did = ctx.params.did || `did:plc:${slug}`;
        const handle = ctx.params.handle || `${slug}.test`;

        // Ensure SemApps key creation has a dataset context for pod-provider mode.
        const keyCallMeta = {
          ...ctx.meta,
          dataset: slug,
          webId,
        };

        const commitKey = await ctx.call("keys.generateSecp256k1Key", { webId }, { meta: keyCallMeta });
        const rotationKey = await ctx.call("keys.generateSecp256k1Key", { webId }, { meta: keyCallMeta });

        const binding = await ctx.call("identitybindings.upsert", {
          canonicalAccountId,
          webId,
          atprotoDid: did,
          atprotoHandle: handle,
          atSigningKeyRef: commitKey.keyRef,
          atRotationKeyRef: rotationKey.keyRef,
          status: "active",
        });

        return {
          binding,
          commitKeyRef: commitKey.keyRef,
          rotationKeyRef: rotationKey.keyRef,
        };
      },
    },

    /**
     * Sign an ATProto repository commit using the account's secp256k1 signing key.
     *
     * Called by the AT adapter's AtCommitBuilder during repo projection.
     * Keys never leave ActivityPods — only the base64url signature is returned.
     *
     * REST: POST /api/internal/atproto/commit-sign
     */
    signAtprotoCommit: {
      rest: {
        method: "POST",
        path: "/api/internal/atproto/commit-sign",
      },
      params: {
        canonicalAccountId: { type: "string", min: 1 },
        did: { type: "string", min: 1 },
        unsignedCommitBytesBase64: { type: "string", min: 1 },
        rev: { type: "string", min: 1 },
      },

      async handler(ctx) {
        this._auth(ctx);

        const { canonicalAccountId, did, unsignedCommitBytesBase64, rev } = ctx.params;

        // Resolve IdentityBinding to get atSigningKeyRef
        // Assumption: identitybindings.getByCanonicalAccountId returns the IdentityBinding
        let binding;
        try {
          binding = await ctx.call("identitybindings.getByCanonicalAccountId", { canonicalAccountId });
        } catch (e) {
          throw new MoleculerError("IdentityBinding lookup failed", 500, "KEY_UNAVAILABLE", { message: e?.message });
        }
        if (!binding) {
          throw new MoleculerError("IdentityBinding not found", 404, "ACTOR_NOT_FOUND", { canonicalAccountId });
        }
        if (!binding.atSigningKeyRef) {
          throw new MoleculerError("atSigningKeyRef not set — AT keys not yet provisioned", 422, "KEY_UNAVAILABLE", { canonicalAccountId });
        }

        // Fetch secp256k1 key pair from internal key boundary
        let keyPair;
        try {
          keyPair = await ctx.call("keys.getAtprotoKeyPair", { keyRef: binding.atSigningKeyRef });
        } catch (e) {
          throw new MoleculerError("AT key lookup failed", 500, "KEY_UNAVAILABLE", { message: e?.message });
        }
        const privateKeyPem = keyPair?.privateKeyPem || keyPair?.privateKey;
        if (!privateKeyPem) {
          throw new MoleculerError("AT private key not available", 500, "KEY_UNAVAILABLE", { keyRef: binding.atSigningKeyRef });
        }

        // Validate caller-supplied DID matches the binding
        if (binding.atprotoDid && did !== binding.atprotoDid) {
          throw new MoleculerError("Caller DID does not match bound DID", 400, "INVALID_INPUT", {
            supplied: did,
            bound: binding.atprotoDid,
          });
        }

        // Derive keyId: {did}#atproto (standard ATProto key fragment)
        const resolvedDid = binding.atprotoDid || did;
        const keyId = `${resolvedDid}#atproto`;

        // Sign the commit bytes
        let signatureBase64Url;
        try {
          const commitBytes = Buffer.from(unsignedCommitBytesBase64, "base64");
          signatureBase64Url = signSecp256k1(privateKeyPem, commitBytes);
        } catch (e) {
          throw new MoleculerError("Commit signing failed", 500, "SIGNING_FAILED", { message: e?.message });
        }

        return {
          did: resolvedDid,
          keyId,
          signatureBase64Url,
          algorithm: "k256",
          signedAt: new Date().toISOString(),
        };
      },
    },

    /**
     * Sign a did:plc operation using the account's secp256k1 rotation key.
     *
     * Called by the PLC state machine during DID provisioning and rotation.
     * The rotation key is distinct from the commit signing key.
     *
     * REST: POST /api/internal/atproto/plc-sign
     */
    signAtprotoPlcOp: {
      rest: {
        method: "POST",
        path: "/api/internal/atproto/plc-sign",
      },
      params: {
        canonicalAccountId: { type: "string", min: 1 },
        did: { type: "string", min: 1 },
        operationBytesBase64: { type: "string", min: 1 },
      },

      async handler(ctx) {
        this._auth(ctx);

        const { canonicalAccountId, did, operationBytesBase64 } = ctx.params;

        let binding;
        try {
          binding = await ctx.call("identitybindings.getByCanonicalAccountId", { canonicalAccountId });
        } catch (e) {
          throw new MoleculerError("IdentityBinding lookup failed", 500, "KEY_UNAVAILABLE", { message: e?.message });
        }
        if (!binding) {
          throw new MoleculerError("IdentityBinding not found", 404, "ACTOR_NOT_FOUND", { canonicalAccountId });
        }
        if (!binding.atRotationKeyRef) {
          throw new MoleculerError("atRotationKeyRef not set — rotation key not yet provisioned", 422, "KEY_UNAVAILABLE", { canonicalAccountId });
        }

        // Validate caller-supplied DID matches the binding
        if (binding.atprotoDid && did !== binding.atprotoDid) {
          throw new MoleculerError("Caller DID does not match bound DID", 400, "INVALID_INPUT", {
            supplied: did,
            bound: binding.atprotoDid,
          });
        }

        // PLC signing is only valid for did:plc — reject did:web and all other methods
        const resolvedDid = binding.atprotoDid || did;
        if (!String(resolvedDid).startsWith("did:plc:")) {
          throw new MoleculerError("PLC signing is only allowed for did:plc", 400, "INVALID_INPUT", {
            did: resolvedDid,
          });
        }

        let keyPair;
        try {
          keyPair = await ctx.call("keys.getAtprotoKeyPair", { keyRef: binding.atRotationKeyRef });
        } catch (e) {
          throw new MoleculerError("AT rotation key lookup failed", 500, "KEY_UNAVAILABLE", { message: e?.message });
        }
        const privateKeyPem = keyPair?.privateKeyPem || keyPair?.privateKey;
        if (!privateKeyPem) {
          throw new MoleculerError("AT rotation private key not available", 500, "KEY_UNAVAILABLE", { keyRef: binding.atRotationKeyRef });
        }

        // PLC rotation key fragment: {did}#atproto-rotation-key (convention)
        const keyId = `${resolvedDid}#atproto-rotation-key`;

        let signatureBase64Url;
        try {
          const opBytes = Buffer.from(operationBytesBase64, "base64");
          signatureBase64Url = signSecp256k1(privateKeyPem, opBytes);
        } catch (e) {
          throw new MoleculerError("PLC op signing failed", 500, "SIGNING_FAILED", { message: e?.message });
        }

        return {
          did: resolvedDid,
          keyId,
          signatureBase64Url,
          algorithm: "k256",
          signedAt: new Date().toISOString(),
        };
      },
    },

    /**
     * Return the ATProto public key for an account in multibase format.
     *
     * Called during DID document construction and at provisioning time.
     * Returns the compressed secp256k1 public key as multibase base58btc.
     *
     * REST: GET /api/internal/atproto/public-key
     */
    getAtprotoPublicKey: {
      rest: {
        method: "GET",
        path: "/api/internal/atproto/public-key",
      },
      params: {
        canonicalAccountId: { type: "string", min: 1 },
        purpose: { type: "enum", values: ["commit", "rotation"] },
      },

      async handler(ctx) {
        this._auth(ctx);

        const { canonicalAccountId, purpose } = ctx.params;

        let binding;
        try {
          binding = await ctx.call("identitybindings.getByCanonicalAccountId", { canonicalAccountId });
        } catch (e) {
          throw new MoleculerError("IdentityBinding lookup failed", 500, "KEY_UNAVAILABLE", { message: e?.message });
        }
        if (!binding) {
          throw new MoleculerError("IdentityBinding not found", 404, "ACTOR_NOT_FOUND", { canonicalAccountId });
        }

        const keyRef = purpose === "commit" ? binding.atSigningKeyRef : binding.atRotationKeyRef;
        if (!keyRef) {
          throw new MoleculerError(
            `${purpose === "commit" ? "atSigningKeyRef" : "atRotationKeyRef"} not set`,
            422,
            "KEY_UNAVAILABLE",
            { canonicalAccountId, purpose }
          );
        }

        let keyPair;
        try {
          keyPair = await ctx.call("keys.getAtprotoKeyPair", { keyRef });
        } catch (e) {
          throw new MoleculerError("AT key lookup failed", 500, "KEY_UNAVAILABLE", { message: e?.message });
        }
        const publicKeyPem = keyPair?.publicKeyPem || keyPair?.publicKey;
        if (!publicKeyPem && !keyPair?.publicKeyMultibase) {
          throw new MoleculerError("AT public key not available", 500, "KEY_UNAVAILABLE", { keyRef });
        }

        // Convert to multibase
        let publicKeyMultibase = keyPair?.publicKeyMultibase;
        if (!publicKeyMultibase) {
          try {
            const compressed = getCompressedPublicKey(publicKeyPem);
            publicKeyMultibase = secp256k1PubkeyToMultibase(compressed);
          } catch (e) {
            throw new MoleculerError("Public key conversion failed", 500, "KEY_UNAVAILABLE", { message: e?.message });
          }
        }

        const resolvedDid = binding.atprotoDid || null;
        const keyFragment = purpose === "commit" ? "atproto" : "atproto-rotation-key";
        const keyId = resolvedDid ? `${resolvedDid}#${keyFragment}` : `#${keyFragment}`;

        return {
          ...(resolvedDid ? { did: resolvedDid } : {}),
          keyId,
          publicKeyMultibase,
          algorithm: "k256",
        };
      },
    },

    verifyInternalPassword: {
      rest: {
        method: "POST",
        path: "/api/internal/auth/verify",
      },
      params: {
        canonicalAccountId: { type: "string", min: 1 },
        password: { type: "string", min: 1 },
      },

      async handler(ctx) {
        this._auth(ctx);

        const { canonicalAccountId, password } = ctx.params;
        const account = await ctx.call("auth.account.findByWebId", { webId: canonicalAccountId });

        if (!account) {
          ctx.meta.$statusCode = 404;
          return { ok: false, reason: "account_not_found" };
        }

        try {
          await ctx.call("auth.account.verify", {
            username: account.username,
            password,
          });

          return { ok: true, scope: "full" };
        } catch (error) {
          ctx.meta.$statusCode = 401;
          return { ok: false, reason: "invalid_password" };
        }
      },
    },
  },

  methods: {
    /**
     * Authenticate the request using bearer token.
     * This endpoint is internal-only and MUST be protected.
     */
    _auth(ctx) {
      const auth = ctx.meta?.$headers?.authorization || ctx.meta?.$headers?.Authorization;
      if (!auth || !String(auth).startsWith("Bearer ")) {
        throw new MoleculerError("Missing bearer token", 401, "AUTH_FAILED");
      }
      const token = String(auth).slice(7);
      if (!this.settings.auth.bearerToken || token !== this.settings.auth.bearerToken) {
        throw new MoleculerError("Invalid bearer token", 403, "AUTH_FAILED");
      }
    },

    /**
     * Create an error response for a signing request.
     */
    _err(r, code, message, retryable) {
      return {
        requestId: r?.requestId,
        ok: false,
        error: { code, message, retryable },
      };
    },

    /**
     * Validate that the actorUri is a local actor controlled by this ActivityPods deployment.
     * This is the critical authority boundary enforcement.
     */
    async _validateLocalActor(ctx, actorUri) {
      if (!actorUri || typeof actorUri !== "string") {
        return { ok: false, error: "INVALID_INPUT", message: "actorUri missing" };
      }
      try {
        new URL(actorUri);
      } catch {
        return { ok: false, error: "INVALID_INPUT", message: "actorUri not a URL" };
      }

      // Strong enforcement: verify actor is local to this deployment.
      // Prefer activitypub.actor.isLocal when available, and fall back to
      // ldp.remote.isRemote so local dev stacks can still validate locality.
      try {
        const isLocal = await ctx.call("activitypub.actor.isLocal", { actorUri });
        if (isLocal) {
          return { ok: true };
        }
      } catch {
        // Ignore and continue to fallback check below.
      }

      try {
        const isRemote = await ctx.call("ldp.remote.isRemote", { resourceUri: actorUri });
        if (isRemote === false) {
          return { ok: true };
        }
      } catch {
        return { ok: false, error: "ACTOR_NOT_LOCAL", message: "locality verification unavailable" };
      }

      return { ok: false, error: "ACTOR_NOT_LOCAL", message: "actorUri not local" };
    },

    /**
     * Parse body bytes from the request.
     * Body must be the exact serialized bytes that will be transmitted.
     */
    _parseBodyBytes(r) {
      const body = r?.body;
      if (!body) return null;

      const bytesStr = body?.bytes;
      if (typeof bytesStr !== "string") return null;
      return Buffer.from(bytesStr, body?.encoding === "utf8" ? "utf8" : "utf8");
    },

    /**
     * Validate date skew to prevent replay attacks.
     */
    _validateDateSkew(dateStr) {
      const t = Date.parse(dateStr);
      if (Number.isNaN(t)) return true; // Let unparseable dates through
      const now = Date.now();
      const skewMs = Math.abs(now - t);
      return skewMs <= this.settings.limits.maxClockSkewSeconds * 1000;
    },

    /**
     * Sign a single HTTP request.
     * Returns signed headers or error.
     */
    async _signOne(ctx, actorUri, keyId, privateKeyPem, r) {
      try {
        const requestId = r?.requestId;
        const method = normalizeMethod(r?.method);
        const profileName = r?.profile;

        const profile = this.settings.profiles[profileName];
        if (!profile) {
          return this._err(r, "PROFILE_NOT_ALLOWED", `unknown profile: ${profileName}`, false);
        }

        const host = r?.target?.host;
        const path = r?.target?.path;
        const query = r?.target?.query || "";

        // Validate required fields
        if (!assertHost(host)) {
          return this._err(r, "INVALID_INPUT", "target.host invalid", false);
        }
        if (!assertPath(path)) {
          return this._err(r, "INVALID_INPUT", "target.path invalid", false);
        }
        if (!method || !["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) {
          return this._err(r, "INVALID_INPUT", "method invalid", false);
        }

        // Handle date: use provided or generate
        let date = r?.headers?.date;
        if (!date) {
          date = toHttpDate();
        }
        if (!this._validateDateSkew(date)) {
          return this._err(r, "INVALID_INPUT", "date skew too large", false);
        }

        // Handle digest for POST/PUT requests
        let digest = null;
        let bodySha256Base64 = null;

        if (profile.requireDigest) {
          const digestMode = r?.digest?.mode || "server_compute";

          if (digestMode === "server_compute") {
            // Preferred: sidecar provides body bytes, we compute digest
            const bodyBuf = this._parseBodyBytes(r);
            if (!bodyBuf) {
              return this._err(r, "INVALID_INPUT", "body.bytes required for POST profile", false);
            }
            if (bodyBuf.length > this.settings.limits.maxBodyBytes) {
              return this._err(r, "BODY_TOO_LARGE", `body exceeds ${this.settings.limits.maxBodyBytes} bytes`, false);
            }
            bodySha256Base64 = sha256Base64(bodyBuf);
            digest = `SHA-256=${bodySha256Base64}`;
          } else if (digestMode === "caller_provided_strict") {
            // Caller provides digest; we MUST verify it matches the body
            const providedDigest = r?.digest?.value;
            const providedBodyHash = r?.digest?.bodyHashSha256Base64;
            const bodyBuf = this._parseBodyBytes(r);

            if (!providedDigest || !bodyBuf) {
              return this._err(r, "INVALID_INPUT", "digest.value and body.bytes required for caller_provided_strict", false);
            }

            // Verify the provided digest matches the body
            const computedHash = sha256Base64(bodyBuf);
            if (providedBodyHash && providedBodyHash !== computedHash) {
              return this._err(r, "DIGEST_MISMATCH", "provided bodyHashSha256Base64 does not match body", false);
            }

            const expectedDigest = `SHA-256=${computedHash}`;
            if (providedDigest !== expectedDigest) {
              return this._err(r, "DIGEST_MISMATCH", "provided digest does not match computed digest", false);
            }

            digest = providedDigest;
            bodySha256Base64 = computedHash;
          } else {
            return this._err(r, "INVALID_INPUT", `unknown digest.mode: ${digestMode}`, false);
          }
        }

        // Get content-type if needed for signing
        const contentType = r?.headers?.contentType || "application/activity+json";

        // Build the request target
        const requestTarget = buildRequestTarget(method, path, query);

        // Build the signing string
        const signingString = buildSigningString(
          { requestTarget, host, date, digest, contentType },
          profile.signedHeaders
        );

        // Sign with RSA-SHA256
        const signature = signRsaSha256(privateKeyPem, signingString);

        // Build the Signature header (Cavage-style)
        const signedHeadersList = profile.signedHeaders.join(" ");
        const signatureHeader = [
          `keyId="${keyId}"`,
          `algorithm="${profile.algorithm}"`,
          `headers="${signedHeadersList}"`,
          `signature="${signature}"`,
        ].join(",");

        // Build output headers
        const outHeaders = {
          Date: date,
          Signature: signatureHeader,
        };
        if (digest) {
          outHeaders.Digest = digest;
        }

        return {
          requestId,
          ok: true,
          actorUri,
          profile: profileName,
          signedComponents: {
            method,
            path,
            host,
          },
          outHeaders,
          meta: {
            keyId,
            algorithm: profile.algorithm,
            signedHeaders: signedHeadersList,
            bodySha256Base64,
          },
        };
      } catch (e) {
        return this._err(r, "INTERNAL_ERROR", e?.message || "signing failed", true);
      }
    },
  },
};
