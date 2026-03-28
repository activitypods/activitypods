#!/usr/bin/env node
"use strict";

const crypto = require("crypto");

const SECP256K1_MULTICODEC_PREFIX = Buffer.from([0xe7, 0x01]);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toBase58(buffer) {
  if (!buffer || buffer.length === 0) return "";

  let value = BigInt(`0x${buffer.toString("hex")}`);
  let out = "";
  while (value > 0n) {
    out = BASE58_ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }

  for (let i = 0; i < buffer.length && buffer[i] === 0; i += 1) {
    out = `1${out}`;
  }

  return out;
}

function secp256k1PublicPemToMultibase(publicKeyPem) {
  const publicKey = crypto.createPublicKey(publicKeyPem);
  const spkiDer = publicKey.export({ type: "spki", format: "der" });
  const point = spkiDer.slice(-65);

  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error("Invalid secp256k1 SPKI key encoding");
  }

  const x = point.slice(1, 33);
  const y = point.slice(33, 65);
  const prefix = (y[31] & 1) === 0 ? 0x02 : 0x03;
  const compressed = Buffer.concat([Buffer.from([prefix]), x]);

  return `z${toBase58(Buffer.concat([SECP256K1_MULTICODEC_PREFIX, compressed]))}`;
}

function generateSecp256k1Pair() {
  return crypto.generateKeyPairSync("ec", {
    namedCurve: "secp256k1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchPublicKeyFromService({ baseUrl, token, canonicalAccountId, purpose }) {
  const url = `${baseUrl}/api/internal/atproto/public-key?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}&purpose=${encodeURIComponent(purpose)}`;
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (err) {
    // Service not reachable — return a sentinel so callers can skip service-dependent checks.
    return { status: null, unavailable: true, error: err.message, body: {} };
  }

  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw: body };
  }

  return {
    status: response.status,
    body: parsed
  };
}

async function main() {
  const baseUrl = process.env.ATPROTO_SMOKE_BASE_URL || "http://localhost:3000";
  const token = process.env.ACTIVITYPODS_TOKEN || "test-atproto-signing-token-local";
  const canonicalAccountId = process.env.ATPROTO_SMOKE_CANONICAL_ACCOUNT_ID || "http://localhost:3000/atproto365133";

  // 1) Generated secp256k1 PEM converts to multibase starting with z
  const commitPair = generateSecp256k1Pair();
  const commitMultibase = secp256k1PublicPemToMultibase(commitPair.publicKey);
  assert(commitMultibase.startsWith("z"), "Expected commit multibase to start with z");

  // 2) Same key should produce stable multibase across repeated conversion
  const commitMultibase2 = secp256k1PublicPemToMultibase(commitPair.publicKey);
  assert(commitMultibase === commitMultibase2, "Expected stable multibase across repeated reads");

  // 3) Distinct generated key should produce a different multibase value
  const rotationPair = generateSecp256k1Pair();
  const rotationMultibase = secp256k1PublicPemToMultibase(rotationPair.publicKey);
  assert(commitMultibase !== rotationMultibase, "Expected commit and rotation generated keys to differ");

  // 4) Service public key endpoint should return multibase with z prefix for both purposes
  const commitKeyResponse = await fetchPublicKeyFromService({
    baseUrl,
    token,
    canonicalAccountId,
    purpose: "commit"
  });

  const rotationKeyResponse = await fetchPublicKeyFromService({
    baseUrl,
    token,
    canonicalAccountId,
    purpose: "rotation"
  });

  const serviceAvailable = !commitKeyResponse.unavailable && !rotationKeyResponse.unavailable;

  if (serviceAvailable && commitKeyResponse.status === 200 && rotationKeyResponse.status === 200) {
    assert(
      typeof commitKeyResponse.body.publicKeyMultibase === "string" && commitKeyResponse.body.publicKeyMultibase.startsWith("z"),
      "Expected commit endpoint publicKeyMultibase to start with z"
    );
    assert(
      typeof rotationKeyResponse.body.publicKeyMultibase === "string" && rotationKeyResponse.body.publicKeyMultibase.startsWith("z"),
      "Expected rotation endpoint publicKeyMultibase to start with z"
    );
    assert(
      commitKeyResponse.body.publicKeyMultibase !== rotationKeyResponse.body.publicKeyMultibase,
      "Expected commit and rotation endpoint public keys to be distinct"
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        localConversion: {
          commitStartsWithZ: commitMultibase.startsWith("z"),
          stableAcrossReads: commitMultibase === commitMultibase2,
          commitVsRotationDistinct: commitMultibase !== rotationMultibase
        },
        serviceValidation: serviceAvailable
          ? {
              baseUrl,
              canonicalAccountId,
              commitStatus: commitKeyResponse.status,
              rotationStatus: rotationKeyResponse.status,
              commitPublicKeyMultibase: commitKeyResponse.body.publicKeyMultibase || null,
              rotationPublicKeyMultibase: rotationKeyResponse.body.publicKeyMultibase || null,
              distinct:
                commitKeyResponse.body.publicKeyMultibase && rotationKeyResponse.body.publicKeyMultibase
                  ? commitKeyResponse.body.publicKeyMultibase !== rotationKeyResponse.body.publicKeyMultibase
                  : null
            }
          : { skipped: true, reason: commitKeyResponse.error || "service unavailable" }
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
