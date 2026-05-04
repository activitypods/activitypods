/**
 * did:plc genesis operation builder.
 *
 * Network-free, deterministic. Given a canonicalAccountId + handle + PDS
 * URL + signing/rotation keys, produces:
 *
 *   1. An unsigned PLC operation (canonical JSON shape per
 *      https://github.com/did-method-plc/did-method-plc).
 *   2. A canonical DAG-CBOR encoding of that op.
 *   3. A secp256k1 signature over the CBOR bytes (delegated to the
 *      `signing.signAtprotoPlcOp` action so private keys never leave
 *      the key boundary).
 *   4. The signed op (unsigned + `sig` field).
 *   5. The derived `did:plc:<24chars>` from sha256 of the signed CBOR,
 *      base32-lower-encoded and truncated.
 *
 * This service does NO network I/O. The submitter
 * (`atproto-plc-submitter`) consumes the artifacts produced here and
 * handles plc.directory submission with retry/self-healing.
 *
 * Why an inline canonical CBOR encoder:
 *   The PLC op has a strictly bounded shape (string keys, string/null
 *   values, arrays of strings, one nested map). Pulling in @ipld/dag-cbor
 *   adds runtime surface and a chain of multiformats deps. The encoder
 *   here implements the subset of DAG-CBOR strictly required for this
 *   shape, with hard rejections of anything outside it. Output is
 *   verified against the spec invariants in
 *   `scripts/proof-atproto-plc-builder.js`.
 *
 * Spec references:
 *   - https://github.com/did-method-plc/did-method-plc
 *   - https://atproto.com/specs/cryptography
 *   - https://ipld.io/specs/codecs/dag-cbor/spec/
 */

const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;

// ============================================================================
// Canonical DAG-CBOR encoder (restricted shape: string | null | array | map)
// ============================================================================

const MAJOR_TEXT = 3;
const MAJOR_ARRAY = 4;
const MAJOR_MAP = 5;
const NULL_BYTE = 0xf6;

/**
 * Encode an unsigned major-type-N integer length according to CBOR rules
 * (shortest form, big-endian).
 */
function encodeTypeAndLength(major, len) {
  const head = major << 5;
  if (len < 24) return Buffer.from([head | len]);
  if (len < 256) return Buffer.from([head | 24, len]);
  if (len < 65536) {
    const out = Buffer.alloc(3);
    out[0] = head | 25;
    out.writeUInt16BE(len, 1);
    return out;
  }
  if (len < 4294967296) {
    const out = Buffer.alloc(5);
    out[0] = head | 26;
    out.writeUInt32BE(len, 1);
    return out;
  }
  throw new MoleculerError('CBOR length out of range', 500, 'CBOR_ENCODE_OVERFLOW');
}

function encodeText(value) {
  if (typeof value !== 'string') {
    throw new MoleculerError('CBOR encode expected string', 500, 'CBOR_ENCODE_TYPE');
  }
  const utf8 = Buffer.from(value, 'utf8');
  return Buffer.concat([encodeTypeAndLength(MAJOR_TEXT, utf8.length), utf8]);
}

function encodeArray(value) {
  if (!Array.isArray(value)) {
    throw new MoleculerError('CBOR encode expected array', 500, 'CBOR_ENCODE_TYPE');
  }
  const parts = [encodeTypeAndLength(MAJOR_ARRAY, value.length)];
  for (const item of value) parts.push(encodeAny(item));
  return Buffer.concat(parts);
}

/**
 * DAG-CBOR canonical map ordering: keys sorted by (length asc, then
 * bytewise ascending on UTF-8 bytes). All keys MUST be strings.
 */
function encodeMap(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MoleculerError('CBOR encode expected plain object', 500, 'CBOR_ENCODE_TYPE');
  }
  const entries = Object.entries(value);
  const encodedKeys = entries.map(([k, v]) => {
    if (typeof k !== 'string') {
      throw new MoleculerError('CBOR map keys must be strings', 500, 'CBOR_ENCODE_KEY_TYPE');
    }
    return { kBuf: Buffer.from(k, 'utf8'), v };
  });
  encodedKeys.sort((a, b) => {
    if (a.kBuf.length !== b.kBuf.length) return a.kBuf.length - b.kBuf.length;
    return Buffer.compare(a.kBuf, b.kBuf);
  });
  const parts = [encodeTypeAndLength(MAJOR_MAP, encodedKeys.length)];
  for (const { kBuf, v } of encodedKeys) {
    parts.push(encodeTypeAndLength(MAJOR_TEXT, kBuf.length), kBuf, encodeAny(v));
  }
  return Buffer.concat(parts);
}

function encodeAny(value) {
  if (value === null) return Buffer.from([NULL_BYTE]);
  if (typeof value === 'string') return encodeText(value);
  if (Array.isArray(value)) return encodeArray(value);
  if (typeof value === 'object') return encodeMap(value);
  throw new MoleculerError(
    `CBOR encode does not support type ${typeof value} for PLC op shape`,
    500,
    'CBOR_ENCODE_UNSUPPORTED'
  );
}

// ============================================================================
// Base32-lower (RFC 4648, no padding) — used by did:plc identifier derivation
// ============================================================================

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32LowerEncode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

// ============================================================================
// Service
// ============================================================================

module.exports = {
  name: 'atproto-plc-builder',

  dependencies: ['signing'],

  settings: {
    internalBearerToken: process.env.ACTIVITYPODS_TOKEN || ''
  },

  actions: {
    /**
     * Build, sign, and derive a complete PLC genesis op artifact.
     *
     * Returns:
     *   {
     *     did:                       'did:plc:<24chars>',
     *     signedOp:                  <JSON op including base64url sig>,
     *     signedOpCborBase64:        <canonical CBOR of signedOp>,
     *     unsignedOpCborBase64:      <canonical CBOR of unsigned op>,
     *     rotationKeyMultibase:      <z...>,
     *     verificationKeyMultibase:  <z...>,
     *     handle, pdsEndpoint
     *   }
     *
     * Pure of network. Idempotent: same inputs produce identical output.
     */
    buildAndSign: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        handle: { type: 'string', min: 1 },
        pdsEndpoint: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const { canonicalAccountId, handle, pdsEndpoint } = ctx.params;

        // Defensive normalization — refuse to build an op for inputs that
        // would clearly be rejected by remote verifiers.
        if (!/^https?:\/\/[^\s/]+(?:\/)?$/.test(pdsEndpoint)) {
          throw new MoleculerError(
            'pdsEndpoint must be an origin-only URL (no path/query/fragment)',
            400,
            'PLC_INVALID_PDS_ENDPOINT'
          );
        }
        const cleanedPds = pdsEndpoint.replace(/\/+$/, '');

        const signingMeta = this._signingCallMeta();

        const verification = await ctx.call(
          'signing.getAtprotoPublicKey',
          { canonicalAccountId, purpose: 'commit' },
          signingMeta
        );
        const rotation = await ctx.call(
          'signing.getAtprotoPublicKey',
          { canonicalAccountId, purpose: 'rotation' },
          signingMeta
        );

        const verificationKeyMultibase = verification?.publicKeyMultibase;
        const rotationKeyMultibase = rotation?.publicKeyMultibase;
        if (!verificationKeyMultibase || !rotationKeyMultibase) {
          throw new MoleculerError('Missing multibase public key from signing service', 500, 'PLC_KEY_UNAVAILABLE');
        }

        const verificationDidKey = `did:key:${verificationKeyMultibase}`;
        const rotationDidKey = `did:key:${rotationKeyMultibase}`;

        const unsignedOp = {
          type: 'plc_operation',
          rotationKeys: [rotationDidKey],
          verificationMethods: { atproto: verificationDidKey },
          alsoKnownAs: [`at://${handle}`],
          services: {
            atproto_pds: {
              type: 'AtprotoPersonalDataServer',
              endpoint: cleanedPds
            }
          },
          prev: null
        };

        const unsignedOpCbor = encodeMap(unsignedOp);

        // Sign the canonical CBOR of the unsigned op. The signing service
        // returns base64url (no padding) compact-format secp256k1 with
        // low-S normalization — exactly what plc.directory expects.
        const signResult = await ctx.call(
          'signing.signAtprotoPlcOp',
          {
            canonicalAccountId,
            // `did` is required by the signing action but used only as a
            // sanity check against the bound DID. At genesis time no DID
            // exists yet — pass a placeholder; the signer skips the match
            // check when the binding has no atprotoDid yet.
            did: 'did:plc:pending',
            operationBytesBase64: unsignedOpCbor.toString('base64')
          },
          signingMeta
        );

        const sig = signResult?.signatureBase64Url;
        if (!sig || typeof sig !== 'string') {
          throw new MoleculerError('signing.signAtprotoPlcOp returned no signature', 500, 'PLC_SIGN_FAILED');
        }

        // Canonical signed op: append `sig` field. CBOR canonical ordering
        // is enforced by the encoder, so insertion order does not matter.
        const signedOp = { ...unsignedOp, sig };
        const signedOpCbor = encodeMap(signedOp);
        const signedOpHash = crypto.createHash('sha256').update(signedOpCbor).digest();
        const did = `did:plc:${base32LowerEncode(signedOpHash).slice(0, 24)}`;

        return {
          did,
          handle,
          pdsEndpoint: cleanedPds,
          rotationKeyMultibase,
          verificationKeyMultibase,
          signedOp,
          signedOpCborBase64: signedOpCbor.toString('base64'),
          unsignedOpCborBase64: unsignedOpCbor.toString('base64')
        };
      }
    },

    /**
     * Encode an arbitrary plain-shape value to canonical DAG-CBOR. Public
     * for the proof script and tests; rejects anything outside the
     * supported shape (string | null | array<plain> | object<string, plain>).
     */
    encodeCanonicalCbor: {
      params: { value: { type: 'any' } },
      async handler(ctx) {
        return encodeAny(ctx.params.value).toString('base64');
      }
    }
  },

  methods: {
    _signingCallMeta() {
      // Internal calls to signing.* are gated by Bearer token. Reuse the
      // same env knob as atproto-provisioning so a single secret governs
      // all signing access.
      return {
        meta: {
          $headers: {
            authorization: `Bearer ${this.settings.internalBearerToken}`
          }
        }
      };
    }
  }
};
