#!/usr/bin/env node
"use strict";

/**
 * atproto-signing-smoke.js
 *
 * Full Part-6 smoke test for the ActivityPods ATProto signing backend.
 *
 * Checks (in order):
 *   1.  Provision or ensure identity binding exists
 *   2.  GET /api/internal/atproto/public-key?purpose=commit
 *   3.  GET /api/internal/atproto/public-key?purpose=rotation
 *   4.  POST /api/internal/atproto/commit-sign
 *   5.  POST /api/internal/atproto/plc-sign
 *   6.  Negative: PLC signing rejects non-matching DID
 *
 * Asserts:
 *   - Both public-key responses are 200 with z-prefixed multibase
 *   - Commit key and rotation key are distinct
 *   - Both signing responses are 200 with base64url signatures
 *   - Signatures are non-empty and base64url-encoded
 *   - Negative: PLC sign with wrong DID returns 400 or 422
 *
 * Environment variables (all optional, defaults match local dev):
 *   ATPROTO_SMOKE_BASE_URL              default: http://localhost:3004
 *   ACTIVITYPODS_TOKEN                  default: test-atproto-signing-token-local
 *   ATPROTO_SMOKE_CANONICAL_ACCOUNT_ID  default: http://localhost:3000/atproto365133
 */

const BASE_URL = process.env.ATPROTO_SMOKE_BASE_URL || "http://localhost:3004";
const TOKEN = process.env.ACTIVITYPODS_TOKEN || "test-atproto-signing-token-local";
const CANONICAL_ACCOUNT_ID =
  process.env.ATPROTO_SMOKE_CANONICAL_ACCOUNT_ID || "http://localhost:3000/atproto365133";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const BASE64URL_RE = /^[A-Za-z0-9\-_]+$/;
function isBase64Url(str) {
  return typeof str === "string" && str.length > 0 && BASE64URL_RE.test(str);
}

/** Derive a slug from a canonical account ID URL (last path segment). */
function slugFromUrl(url) {
  return new URL(url).pathname.split("/").filter(Boolean).pop() || "account";
}

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const slug = slugFromUrl(CANONICAL_ACCOUNT_ID);
  const results = {};

  // ── Step 1: Provision ──────────────────────────────────────────────────────
  console.error("[1] Provisioning identity binding...");
  const provision = await postJson("/api/internal/atproto/provision", {
    canonicalAccountId: CANONICAL_ACCOUNT_ID,
    webId: CANONICAL_ACCOUNT_ID,
    did: `did:plc:${slug}`,
    handle: `${slug}.test`,
  });
  results.provision = { status: provision.status };

  // Provision must succeed (200) or indicate the binding already exists (409 is fine).
  // If neither, abort early with full body for diagnosis.
  if (provision.status !== 200 && provision.status !== 409) {
    results.provision.body = provision.body;
    console.log(JSON.stringify({ ok: false, failedAt: "provision", results }, null, 2));
    process.exit(1);
  }

  // Resolve the real DID from the provision response (if 200) or fall back to assumed DID.
  const atprotoDid =
    provision.status === 200
      ? provision.body?.binding?.atprotoDid || provision.body?.atprotoDid || `did:plc:${slug}`
      : `did:plc:${slug}`;

  results.provision.atprotoDid = atprotoDid;

  // ── Step 2: Commit public key ──────────────────────────────────────────────
  console.error("[2] Fetching commit public key...");
  const commitKey = await getJson(
    `/api/internal/atproto/public-key?canonicalAccountId=${encodeURIComponent(CANONICAL_ACCOUNT_ID)}&purpose=commit`
  );
  results.commitKey = { status: commitKey.status, body: commitKey.body };

  assert(commitKey.status === 200, `commit public-key status expected 200, got ${commitKey.status}`);
  assert(
    typeof commitKey.body.publicKeyMultibase === "string" &&
      commitKey.body.publicKeyMultibase.startsWith("z"),
    `commit publicKeyMultibase must start with 'z', got: ${commitKey.body.publicKeyMultibase}`
  );

  // ── Step 3: Rotation public key ───────────────────────────────────────────
  console.error("[3] Fetching rotation public key...");
  const rotationKey = await getJson(
    `/api/internal/atproto/public-key?canonicalAccountId=${encodeURIComponent(CANONICAL_ACCOUNT_ID)}&purpose=rotation`
  );
  results.rotationKey = { status: rotationKey.status, body: rotationKey.body };

  assert(rotationKey.status === 200, `rotation public-key status expected 200, got ${rotationKey.status}`);
  assert(
    typeof rotationKey.body.publicKeyMultibase === "string" &&
      rotationKey.body.publicKeyMultibase.startsWith("z"),
    `rotation publicKeyMultibase must start with 'z', got: ${rotationKey.body.publicKeyMultibase}`
  );

  // ── Step 3a: Commit and rotation keys must be distinct ────────────────────
  assert(
    commitKey.body.publicKeyMultibase !== rotationKey.body.publicKeyMultibase,
    "commit and rotation publicKeyMultibase must be distinct"
  );
  results.keysDistinct = true;

  // ── Step 4: Commit sign ───────────────────────────────────────────────────
  console.error("[4] Posting commit-sign...");
  // Use plausible-looking commit bytes (does not need to be a real MST commit for this
  // smoke test — we are verifying the signing path and key selection, not ATProto semantics).
  const fakeCommitBytes = Buffer.from(
    JSON.stringify({ did: atprotoDid, rev: "2222222222222", dataRoot: "bafyreiabc" })
  ).toString("base64");

  const commitSign = await postJson("/api/internal/atproto/commit-sign", {
    canonicalAccountId: CANONICAL_ACCOUNT_ID,
    did: atprotoDid,
    unsignedCommitBytesBase64: fakeCommitBytes,
    rev: "2222222222222",
  });
  results.commitSign = { status: commitSign.status, body: commitSign.body };

  assert(
    commitSign.status === 200,
    `commit-sign status expected 200, got ${commitSign.status}. Body: ${JSON.stringify(commitSign.body)}`
  );
  assert(
    isBase64Url(commitSign.body.signatureBase64Url),
    `commit-sign signatureBase64Url must be non-empty base64url, got: ${commitSign.body.signatureBase64Url}`
  );
  assert(
    commitSign.body.algorithm === "k256",
    `commit-sign algorithm expected 'k256', got: ${commitSign.body.algorithm}`
  );
  // keyId must end with exactly #atproto (NOT #atproto-rotation-key)
  assert(
    typeof commitSign.body.keyId === "string" && commitSign.body.keyId.endsWith("#atproto"),
    `commit-sign keyId must end with '#atproto', got: ${commitSign.body.keyId}`
  );

  // ── Step 5: PLC sign ──────────────────────────────────────────────────────
  console.error("[5] Posting plc-sign...");
  const fakePlcOpBytes = Buffer.from(
    JSON.stringify({ type: "plc_operation", rotationKeys: [], verificationMethods: {} })
  ).toString("base64");

  const plcSign = await postJson("/api/internal/atproto/plc-sign", {
    canonicalAccountId: CANONICAL_ACCOUNT_ID,
    did: atprotoDid,
    operationBytesBase64: fakePlcOpBytes,
  });
  results.plcSign = { status: plcSign.status, body: plcSign.body };

  assert(
    plcSign.status === 200,
    `plc-sign status expected 200, got ${plcSign.status}. Body: ${JSON.stringify(plcSign.body)}`
  );
  assert(
    isBase64Url(plcSign.body.signatureBase64Url),
    `plc-sign signatureBase64Url must be non-empty base64url, got: ${plcSign.body.signatureBase64Url}`
  );
  assert(
    plcSign.body.algorithm === "k256",
    `plc-sign algorithm expected 'k256', got: ${plcSign.body.algorithm}`
  );
  // keyId should point to the rotation key fragment (#atproto-rotation-key)
  assert(
    typeof plcSign.body.keyId === "string" &&
      plcSign.body.keyId.includes("#atproto-rotation-key"),
    `plc-sign keyId should include '#atproto-rotation-key', got: ${plcSign.body.keyId}`
  );

  // ── Step 5a: Commit and rotation signatures use distinct keys ─────────────
  // The signatures were over different payloads so we can't compare bytes,
  // but the keyId fragments must differ — that is the authoritative check.
  assert(
    commitSign.body.keyId !== plcSign.body.keyId,
    "commit-sign and plc-sign keyId values must differ (different key slots)"
  );
  results.signingKeysDistinct = true;

  // ── Step 6: Negative — PLC sign rejects non-matching DID ─────────────────
  console.error("[6] Negative: plc-sign with non-matching DID...");
  const wrongDid = "did:plc:zzzzzzzzzzzzzzzzzzzzzzzz";
  const plcSignNeg = await postJson("/api/internal/atproto/plc-sign", {
    canonicalAccountId: CANONICAL_ACCOUNT_ID,
    did: wrongDid,
    operationBytesBase64: fakePlcOpBytes,
  });
  results.plcSignNegative = { status: plcSignNeg.status, didUsed: wrongDid };

  // DID mismatch is always 400 INVALID_INPUT (not 422; that is only for missing keys)
  assert(
    plcSignNeg.status === 400,
    `plc-sign with wrong DID expected 400, got ${plcSignNeg.status}. Body: ${JSON.stringify(plcSignNeg.body)}`
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: BASE_URL,
        canonicalAccountId: CANONICAL_ACCOUNT_ID,
        atprotoDid,
        checks: {
          provision: results.provision.status,
          commitKeyZ: commitKey.body.publicKeyMultibase?.startsWith("z") ?? false,
          rotationKeyZ: rotationKey.body.publicKeyMultibase?.startsWith("z") ?? false,
          keysDistinct: results.keysDistinct,
          commitSignStatus: commitSign.status,
          commitSignBase64Url: isBase64Url(commitSign.body.signatureBase64Url),
          plcSignStatus: plcSign.status,
          plcSignBase64Url: isBase64Url(plcSign.body.signatureBase64Url),
          signingKeysDistinctKeyIds: results.signingKeysDistinct,
          negativeRejected: plcSignNeg.status === 400,
        },
        publicKeys: {
          commit: commitKey.body.publicKeyMultibase,
          rotation: rotationKey.body.publicKeyMultibase,
          commitKeyId: commitKey.body.keyId,
          rotationKeyId: rotationKey.body.keyId,
        },
        signatures: {
          commitKeyId: commitSign.body.keyId,
          plcKeyId: plcSign.body.keyId,
        },
      },
      null,
      2
    )
  );
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
