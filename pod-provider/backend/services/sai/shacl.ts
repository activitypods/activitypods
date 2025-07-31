// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema, defineAction } from 'moleculer';

const ShaclServiceSchema = {
  name: 'shacl' as const,

  actions: {
    get: defineAction({
      async handler(ctx: any) {
        const { resourceUri } = ctx.params;
        return await ctx.call('ldp.remote.get', { resourceUri, accept: MIME_TYPES.JSON });
      }
    }),

    getTypes: defineAction({
      // Extract the required types from the SHACL shape
      // @ts-expect-error TS(7023): 'getTypes' implicitly has return type 'any' becaus... Remove this comment to see the full error message
      async handler(ctx: any) {
        const { resourceUri } = ctx.params;
        // @ts-expect-error TS(7022): 'shape' implicitly has type 'any' because it does ... Remove this comment to see the full error message
        const shape = await this.actions.get({ resourceUri }, { parentCtx: ctx });
        return shape[0]['http://www.w3.org/ns/shacl#targetClass']?.map((node: any) => node['@id']) || [];
      }
    })
  }
} satisfies ServiceSchema;

export default ShaclServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ShaclServiceSchema.name]: typeof ShaclServiceSchema;
    }
  }
}
