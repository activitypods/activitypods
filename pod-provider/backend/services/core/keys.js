const crypto = require('crypto');
const { MIME_TYPES } = require('@semapps/mime-types');
const { KEY_TYPES } = require('@semapps/crypto/constants');
const { KeysService } = require('@semapps/crypto');

const ATPROTO_KEY_TYPE = 'urn:secp256k1-key';
const VERIFICATION_METHOD_TYPE = 'https://w3id.org/security#VerificationMethod';
const SECP256K1_MULTICODEC_PREFIX = Buffer.from([0xe7, 0x01]);
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

module.exports = {
  mixins: [KeysService],
  settings: {
    podProvider: true
  },
  actions: {
    generateKey: {
      params: {
        keyType: { type: 'string' }
      },
      async handler(ctx) {
        const { keyType } = ctx.params;

        if (keyType === ATPROTO_KEY_TYPE) {
          return this.actions.generateSecp256k1KeyMaterial({}, { parentCtx: ctx });
        }

        if (keyType === KEY_TYPES.ED25519) {
          return this.actions.generateEd25519Key({}, { parentCtx: ctx });
        }

        if (keyType === KEY_TYPES.RSA) {
          return this.actions.generateRsaKey({}, { parentCtx: ctx });
        }

        throw new Error('Key type not supported.');
      }
    },

    generateSecp256k1KeyMaterial: {
      params: {},
      async handler() {
        return new Promise((resolve, reject) => {
          crypto.generateKeyPair(
            'ec',
            {
              namedCurve: 'secp256k1',
              publicKeyEncoding: { type: 'spki', format: 'pem' },
              privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            },
            (err, publicKeyPem, privateKeyPem) => {
              if (err) return reject(err);
              resolve({
                '@type': [ATPROTO_KEY_TYPE, VERIFICATION_METHOD_TYPE],
                publicKeyPem,
                privateKeyPem
              });
            }
          );
        });
      }
    },

    generateSecp256k1Key: {
      params: {
        webId: { type: 'string' },
        attachToWebId: { type: 'boolean', optional: true, default: false },
        publishKey: { type: 'boolean', optional: true, default: false }
      },
      async handler(ctx) {
        const { webId, attachToWebId = false, publishKey = false } = ctx.params;

        const keyObject = await this.actions.createKeyForActor(
          {
            webId,
            keyType: ATPROTO_KEY_TYPE,
            attachToWebId,
            publishKey
          },
          { parentCtx: ctx }
        );

        return {
          keyRef: keyObject.id,
          publicKeyRef: keyObject['rdfs:seeAlso'] || null,
          privateKeyPem: keyObject.privateKeyPem,
          publicKeyPem: keyObject.publicKeyPem,
          publicKeyMultibase: this.secp256k1PublicPemToMultibase(keyObject.publicKeyPem)
        };
      }
    },

    getAtprotoKeyPair: {
      params: {
        keyRef: { type: 'string' }
      },
      async handler(ctx) {
        const { keyRef } = ctx.params;
        const keyObject = await ctx.call('keys.container.get', {
          resourceUri: keyRef,
          accept: MIME_TYPES.JSON,
          webId: 'system'
        });

        const keyTypes = asArray(keyObject['@type'] || keyObject.type);
        if (!keyTypes.includes(ATPROTO_KEY_TYPE)) {
          throw new Error('KEY_INVALID: keyRef must be a private secp256k1 key resource URI');
        }
        if (!keyObject.privateKeyPem) {
          throw new Error('KEY_UNAVAILABLE: privateKeyPem missing on key resource');
        }

        let publicKeyPem = keyObject.publicKeyPem;
        if (!publicKeyPem && keyObject['rdfs:seeAlso']) {
          const publicKeyObject = await ctx.call('ldp.resource.get', {
            resourceUri: keyObject['rdfs:seeAlso'],
            accept: MIME_TYPES.JSON,
            webId: 'system'
          });
          publicKeyPem = publicKeyObject.publicKeyPem;
        }
        if (!publicKeyPem) {
          throw new Error('KEY_UNAVAILABLE: publicKeyPem missing on key resource');
        }

        const publicKeyMultibase = this.secp256k1PublicPemToMultibase(publicKeyPem);

        return {
          keyRef,
          privateKeyPem: keyObject.privateKeyPem,
          publicKeyPem,
          publicKeyMultibase,
          // Temporary aliases for compatibility with existing callers.
          privateKey: keyObject.privateKeyPem,
          publicKey: publicKeyPem
        };
      }
    }
  },
  methods: {
    secp256k1PublicPemToMultibase(publicKeyPem) {
      const compressedPoint = this._secp256k1CompressSpkiPublicKey(publicKeyPem);
      return `z${this._toBase58(Buffer.concat([SECP256K1_MULTICODEC_PREFIX, compressedPoint]))}`;
    },

    _secp256k1CompressSpkiPublicKey(publicKeyPem) {
      const publicKey = crypto.createPublicKey(publicKeyPem);
      const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
      const point = spkiDer.slice(-65);

      if (point.length !== 65 || point[0] !== 0x04) {
        throw new Error('Invalid secp256k1 SPKI key encoding');
      }

      const x = point.slice(1, 33);
      const y = point.slice(33, 65);
      const prefix = (y[31] & 1) === 0 ? 0x02 : 0x03;
      return Buffer.concat([Buffer.from([prefix]), x]);
    },

    _toBase58(buffer) {
      if (buffer.length === 0) return '';

      let value = BigInt(`0x${buffer.toString('hex')}`);
      let out = '';
      while (value > 0n) {
        out = BASE58_ALPHABET[Number(value % 58n)] + out;
        value /= 58n;
      }

      for (let i = 0; i < buffer.length && buffer[i] === 0; i += 1) {
        out = '1' + out;
      }

      return out;
    }
  }
};
