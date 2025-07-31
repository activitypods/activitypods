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
      // @ts-expect-error TS(2345): Argument of type 'Buffer' is not assignable to par... Remove this comment to see the full error message
      this.privateJwk = JSON.parse(fs.readFileSync(privateKeyPath));
      // @ts-expect-error TS(2345): Argument of type 'Buffer' is not assignable to par... Remove this comment to see the full error message
      this.publicJwk = JSON.parse(fs.readFileSync(publicKeyPath));
    }
  },

  actions: {
    generateKeyPair: defineAction({
      async handler(ctx: any) {
        const { privateKeyPath, publicKeyPath } = ctx.params;

        // @ts-expect-error TS(2339): Property 'settings' does not exist on type '{ gene... Remove this comment to see the full error message
        const { privateKey, publicKey } = await generateKeyPair(this.settings.alg);

        // @ts-expect-error TS(2339): Property 'privateJwk' does not exist on type '{ ge... Remove this comment to see the full error message
        this.privateJwk = await exportJWK(privateKey);
        // @ts-expect-error TS(2339): Property 'publicJwk' does not exist on type '{ gen... Remove this comment to see the full error message
        this.publicJwk = await exportJWK(publicKey);

        // @ts-expect-error TS(2339): Property 'privateJwk' does not exist on type '{ ge... Remove this comment to see the full error message
        this.privateJwk.alg = this.settings.alg;
        // @ts-expect-error TS(2339): Property 'publicJwk' does not exist on type '{ gen... Remove this comment to see the full error message
        this.publicJwk.alg = this.settings.alg;

        // @ts-expect-error TS(2339): Property 'privateJwk' does not exist on type '{ ge... Remove this comment to see the full error message
        fs.writeFileSync(privateKeyPath, JSON.stringify(this.privateJwk));
        // @ts-expect-error TS(2339): Property 'publicJwk' does not exist on type '{ gen... Remove this comment to see the full error message
        fs.writeFileSync(publicKeyPath, JSON.stringify(this.publicJwk));
      }
    }),

    get: defineAction({
      // @ts-expect-error TS(7023): 'get' implicitly has return type 'any' because it ... Remove this comment to see the full error message
      async handler() {
        // @ts-expect-error TS(2339): Property 'privateJwk' does not exist on type '{ ge... Remove this comment to see the full error message
        return { privateJwk: this.privateJwk, publicJwk: this.publicJwk };
      }
    }),

    verifyToken: defineAction({
      // @ts-expect-error TS(7023): 'verifyToken' implicitly has return type 'any' bec... Remove this comment to see the full error message
      async handler(ctx: any) {
        const { token } = ctx.params;

        // @ts-expect-error TS(7022): 'publicKey' implicitly has type 'any' because it d... Remove this comment to see the full error message
        const publicKey = await importJWK(this.publicJwk, this.settings.alg);

        try {
          // @ts-expect-error TS(7022): 'payload' implicitly has type 'any' because it doe... Remove this comment to see the full error message
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
