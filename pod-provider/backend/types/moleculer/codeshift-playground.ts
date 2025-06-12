const serviceBefore = {
  name: 'service4',
  version: 'v1',
  actions: {
    // Error because it returns a string instead of boolean
    async get(ctx) {
      const foo = ctx.params.foo;
      return;
    },

    returnLength: {
      params: {
        length: { type: 'number' }
      },
      handler(ctx) {
        return ctx.params.length;
      }
    }
  }
};

import { ServiceSchema, defineAction } from 'moleculer';

const serviceAfterCodemod = {
  name: 'service4' as const,
  version: 'v1' as const,
  actions: {
    async get(ctx) {
      const foo = ctx.params.foo;
      return;
    },
    returnLength: defineAction({
      params: {
        length: { type: 'number' }
      },
      handler(ctx) {
        return ctx.params.length;
      }
    })
  }
} satisfies ServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [serviceAfterCodemod.name]: typeof serviceAfterCodemod;
    }
  }
}
