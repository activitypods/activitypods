import { ControlledContainerMixin } from '@semapps/ldp';
import { necessityMapping } from '../../mappings.ts';
import { arraysEqual } from '../../utils.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const AccessNeedsSchema = {
  name: 'access-needs' as const,
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessNeed'],
    readOnly: true,
    activateTombstones: false
  },
  actions: {
    put: defineAction({
      handler() {
        throw new Error(`The resources of type interop:AccessNeed are immutable`);
      }
    }),

    patch: defineAction({
      handler() {
        throw new Error(`The resources of type interop:AccessNeed are immutable`);
      }
    }),

    find: defineAction({
      async handler(ctx) {
        const { shapeTreeUri, accessMode, necessity } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#registeredShapeTree': shapeTreeUri,
              'http://www.w3.org/ns/solid/interop#accessNecessity': necessityMapping[necessity]
            },
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.find(a => arraysEqual(a['interop:accessMode'], accessMode));
      }
    })
  }
} satisfies ServiceSchema;

export default AccessNeedsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AccessNeedsSchema.name]: typeof AccessNeedsSchema;
    }
  }
}
