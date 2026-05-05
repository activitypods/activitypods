#!/usr/bin/env node
/**
 * Proof: did:plc genesis op builder is deterministic and spec-compliant.
 *
 * Invariants checked (no network):
 *
 * 1. Canonical CBOR encoding of the same JS object yields IDENTICAL
 *    bytes across runs.
 * 2. DAG-CBOR map-key ordering is length-asc then bytewise-asc.
 * 3. DID derivation:  base32-lower(sha256(signedOpCbor))[:24]  yields a
 *    24-char identifier with only [a-z2-7].
 * 4. The service's public encodeCanonicalCbor action matches this
 *    independent fixture encoder.
 * 5. Inserting a key in different positions in the source object does
 *    not change the encoded bytes (canonical ordering invariance).
 *
 * Run: ACTIVITYPODS_TOKEN=test-atproto-signing-token-local \
 *      node scripts/proof-atproto-plc-builder.js
 *
 * Exit code 0 = pass.
 */

/* eslint-disable no-console */

const crypto = require('crypto');

// Re-implement the encoder INDEPENDENTLY here so the proof catches any
// drift between this expected behavior and the service implementation.
// Both encoders MUST produce identical bytes for any valid input.

function encodeTL(major, len) {
  const head = major << 5;
  if (len < 24) return Buffer.from([head | len]);
  if (len < 256) return Buffer.from([head | 24, len]);
  if (len < 65536) {
    const out = Buffer.alloc(3);
    out[0] = head | 25;
    out.writeUInt16BE(len, 1);
    return out;
  }
  const out = Buffer.alloc(5);
  out[0] = head | 26;
  out.writeUInt32BE(len, 1);
  return out;
}

function encText(s) {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([encodeTL(3, b.length), b]);
}

function encArr(a) {
  const parts = [encodeTL(4, a.length)];
  for (const v of a) parts.push(encAny(v));
  return Buffer.concat(parts);
}

function encMap(o) {
  const items = Object.entries(o).map(([k, v]) => ({ kBuf: Buffer.from(k, 'utf8'), v }));
  items.sort((a, b) => a.kBuf.length - b.kBuf.length || Buffer.compare(a.kBuf, b.kBuf));
  const parts = [encodeTL(5, items.length)];
  for (const { kBuf, v } of items) {
    parts.push(encodeTL(3, kBuf.length), kBuf, encAny(v));
  }
  return Buffer.concat(parts);
}

function encAny(v) {
  if (v === null) return Buffer.from([0xf6]);
  if (typeof v === 'string') return encText(v);
  if (Array.isArray(v)) return encArr(v);
  if (typeof v === 'object') return encMap(v);
  throw new Error(`unsupported type ${typeof v}`);
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
function base32Lower(buf) {
  let bits = 0;
  let val = 0;
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    val = (val << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(val >>> bits) & 0x1f];
    }
  }
  if (bits > 0) out += BASE32[(val << (5 - bits)) & 0x1f];
  return out;
}

// Cross-check against service implementation.
const path = require('path');
let serviceModule;
try {
  serviceModule = require(path.join(__dirname, '..', 'services', 'core', 'atproto-plc-builder.service.js'));
} catch (e) {
  console.error(`Could not load service module: ${e.message}`);
  process.exit(2);
}
if (!serviceModule || serviceModule.name !== 'atproto-plc-builder') {
  console.error('atproto-plc-builder.service.js did not export the expected service object');
  process.exit(2);
}

// Test fixtures.
const fixtures = [
  {
    name: 'unsigned PLC op',
    value: {
      type: 'plc_operation',
      rotationKeys: ['did:key:zQ3sho1example'],
      verificationMethods: { atproto: 'did:key:zQ3shoVerifyExample' },
      alsoKnownAs: ['at://alice.example.com'],
      services: {
        atproto_pds: { type: 'AtprotoPersonalDataServer', endpoint: 'https://pds.example.com' }
      },
      prev: null
    }
  },
  {
    name: 'signed PLC op (sig added)',
    value: {
      type: 'plc_operation',
      rotationKeys: ['did:key:zQ3sho1example'],
      verificationMethods: { atproto: 'did:key:zQ3shoVerifyExample' },
      alsoKnownAs: ['at://alice.example.com'],
      services: {
        atproto_pds: { type: 'AtprotoPersonalDataServer', endpoint: 'https://pds.example.com' }
      },
      prev: null,
      sig: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_'
    }
  },
  {
    name: 'key insertion order invariance',
    value: {
      // Reverse insertion order from the canonical-sorted form
      sig: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_',
      verificationMethods: { atproto: 'did:key:zQ3shoVerifyExample' },
      services: {
        // Inner map keys also in reverse order
        atproto_pds: { endpoint: 'https://pds.example.com', type: 'AtprotoPersonalDataServer' }
      },
      rotationKeys: ['did:key:zQ3sho1example'],
      prev: null,
      alsoKnownAs: ['at://alice.example.com'],
      type: 'plc_operation'
    }
  }
];

let failures = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  PASS ${msg}`);
  } else {
    console.error(`  FAIL ${msg}`);
    failures += 1;
  }
}

async function main() {
  // 1. Determinism: encoding the same value twice yields identical bytes.
  console.log('# Determinism');
  for (const f of fixtures) {
    const a = encAny(f.value).toString('hex');
    const b = encAny(f.value).toString('hex');
    assert(a === b, `[${f.name}] deterministic encode`);
  }

  // 2. Service public action matches the independent encoder.
  console.log('# Service encoder cross-check');
  for (const f of fixtures) {
    const expected = encAny(f.value).toString('base64');
    const actual = await serviceModule.actions.encodeCanonicalCbor.handler({ params: { value: f.value } });
    assert(actual === expected, `[${f.name}] service encoder matches fixture`);
  }

  // 3. Insertion-order invariance: canonical encoding ignores object
  //    insertion order.
  console.log('# Insertion-order invariance');
  const a = encAny(fixtures[1].value).toString('hex');
  const b = encAny(fixtures[2].value).toString('hex');
  assert(a === b, 'reordered keys yield identical CBOR');

  // 4. DID derivation invariants.
  console.log('# DID derivation');
  const cbor = encAny(fixtures[1].value);
  const hash = crypto.createHash('sha256').update(cbor).digest();
  const id = base32Lower(hash).slice(0, 24);
  const did = `did:plc:${id}`;
  assert(/^did:plc:[a-z2-7]{24}$/.test(did), `derived DID matches did:plc spec syntax: ${did}`);

  // 5. Map-key ordering rule (length asc, then bytewise asc).
  console.log('# Canonical map ordering');
  const obj = { aaa: '1', a: '2', b: '3', aa: '4' };
  const buf = encMap(obj);
  // First encoded key should be 'a' (length 1), then 'b' (length 1, byte > a),
  // then 'aa' (length 2), then 'aaa' (length 3).
  // Skip the map header (1 byte for n=4).
  let pos = 1;
  const keys = [];
  for (let i = 0; i < 4; i++) {
    const head = buf[pos];
    const len = head & 0x1f;
    pos += 1;
    keys.push(buf.slice(pos, pos + len).toString('utf8'));
    pos += len;
    // Skip the value (text-string of length 1)
    pos += 2;
  }
  const expected = ['a', 'b', 'aa', 'aaa'];
  assert(JSON.stringify(keys) === JSON.stringify(expected), `map keys in canonical order: ${JSON.stringify(keys)}`);

  if (failures > 0) {
    console.error(`\nFAILED: ${failures} assertion(s)`);
    process.exit(1);
  }
  console.log('\nALL PASS');
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
