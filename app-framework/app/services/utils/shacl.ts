import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema, defineAction } from 'moleculer';

const ShaclSchema = {
  name: 'shacl' as const,
  actions: {
    get: defineAction({
      async handler(ctx) {
        const { resourceUri } = ctx.params;
        return await ctx.call('ldp.remote.get', { resourceUri, accept: MIME_TYPES.JSON });
      }
    }),

    getTypes: defineAction({
      // Extract the required types from the SHACL shape
      async handler(ctx) {
        const { resourceUri } = ctx.params;
        const shape = await this.actions.get({ resourceUri }, { parentCtx: ctx });
        return shape[0]['http://www.w3.org/ns/shacl#targetClass']?.map(node => node['@id']) || [];
      }
    })
  }
} satisfies ServiceSchema;

export default ShaclSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ShaclSchema.name]: typeof ShaclSchema;
    }
  }
}
