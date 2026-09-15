import fs from 'fs';
import path from 'path';
import { generateKeyPair, exportJWK, importJWK, jwtVerify } from 'jose';
import { ServiceSchema } from 'moleculer';

// See https://github.com/CommunitySolidServer/CommunitySolidServer/blob/15a929a87e4ce00c0ed266e296405c8e4a22d4a7/src/identity/configuration/CachedJwkGenerator.ts
const JwkSchema = {
  name: 'jwk' as const,
  settings: {
    jwtPath: path.resolve(__dirname, '../../jwt'),
    alg: 'ES256'
  },
  async created() {
    const privateKeyPath = path.resolve(this.settings.jwtPath, 'jwk' + this.settings.alg + '.key');
    const publicKeyPath = path.resolve(this.settings.jwtPath, 'jwk' + this.settings.alg + '.key.pub');

    if (!fs.existsSync(privateKeyPath) && !fs.existsSync(publicKeyPath)) {
      this.logger.info('JWK not found, generating...');
      if (!fs.existsSync(this.settings.jwtPath)) {
        fs.mkdirSync(this.settings.jwtPath);
      }
      await this.actions.generateKeyPair({ privateKeyPath, publicKeyPath });
    } else {
      // @ts-expect-error TS(2345): Argument of type 'Buffer' is not assignable to par... Remove this comment to see the full error message
      this.privateJwk = JSON.parse(fs.readFileSync(privateKeyPath));
      // @ts-expect-error TS(2345): Argument of type 'Buffer' is not assignable to par... Remove this comment to see the full error message
      this.publicJwk = JSON.parse(fs.readFileSync(publicKeyPath));
    }
  },
  actions: {
    generateKeyPair: {
      async handler(ctx) {
        const { privateKeyPath, publicKeyPath } = ctx.params;

        const { privateKey, publicKey } = await generateKeyPair(this.settings.alg);

        this.privateJwk = await exportJWK(privateKey);
        this.publicJwk = await exportJWK(publicKey);

        this.privateJwk.alg = this.settings.alg;
        this.publicJwk.alg = this.settings.alg;

        fs.writeFileSync(privateKeyPath, JSON.stringify(this.privateJwk));
        fs.writeFileSync(publicKeyPath, JSON.stringify(this.publicJwk));
      }
    },

    get: {
      async handler() {
        return { privateJwk: this.privateJwk, publicJwk: this.publicJwk };
      }
    },

    verifyToken: {
      async handler(ctx) {
        const { token } = ctx.params;

        const publicKey = await importJWK(this.publicJwk, this.settings.alg);

        try {
          const { payload } = await jwtVerify(token, publicKey);
          return payload;
        } catch (e) {
          // Return nothing. It will trigger a 401 error.
        }
      }
    }
  }
} satisfies ServiceSchema;

export default JwkSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [JwkSchema.name]: typeof JwkSchema;
    }
  }
}
