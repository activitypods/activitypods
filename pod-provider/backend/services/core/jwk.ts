import fs from 'fs';
import path from 'path';
import { generateKeyPair, exportJWK, importJWK, jwtVerify } from 'jose';
import { ServiceSchema, defineAction } from 'moleculer';

const JwkServiceSchema = {
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
      this.privateJwk = JSON.parse(fs.readFileSync(privateKeyPath));
      this.publicJwk = JSON.parse(fs.readFileSync(publicKeyPath));
    }
  },

  actions: {
    generateKeyPair: defineAction({
      async handler(ctx: any) {
        const { privateKeyPath, publicKeyPath } = ctx.params;

        const { privateKey, publicKey } = await generateKeyPair(this.settings.alg);

        this.privateJwk = await exportJWK(privateKey);
        this.publicJwk = await exportJWK(publicKey);

        this.privateJwk.alg = this.settings.alg;
        this.publicJwk.alg = this.settings.alg;

        fs.writeFileSync(privateKeyPath, JSON.stringify(this.privateJwk));
        fs.writeFileSync(publicKeyPath, JSON.stringify(this.publicJwk));
      }
    }),

    get: defineAction({
      async handler() {
        return { privateJwk: this.privateJwk, publicJwk: this.publicJwk };
      }
    }),

    verifyToken: defineAction({
      async handler(ctx: any) {
        const { token } = ctx.params;

        const publicKey = await importJWK(this.publicJwk, this.settings.alg);

        try {
          const { payload } = await jwtVerify(token, publicKey);
          return payload;
        } catch (e) {
          // Return nothing. It will trigger a 401 error.
        }
      }
    })
  }
} satisfies ServiceSchema;

export default JwkServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [JwkServiceSchema.name]: typeof JwkServiceSchema;
    }
  }
}
