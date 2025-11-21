import { ControlledContainerMixin } from '@semapps/ldp';
import { necessityMapping } from '../../mappings.ts';
import { arraysEqual } from '../../utils.ts';
import { ServiceSchema } from 'moleculer';

const AccessNeedsSchema = {
  name: 'access-needs' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/access-needs',
    types: ['interop:AccessNeed'],
    activateTombstones: false
  },
  actions: {
    put: {
      handler() {
        throw new Error(`The resources of type interop:AccessNeed are immutable`);
      }
    },

    patch: {
      handler() {
        throw new Error(`The resources of type interop:AccessNeed are immutable`);
      }
    },

    find: {
      async handler(ctx: any) {
        const { shapeTreeUri, accessMode, necessity, preferredScope } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#registeredShapeTree': shapeTreeUri,
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              'http://www.w3.org/ns/solid/interop#accessNecessity': necessityMapping[necessity],
              'http://www.w3.org/ns/solid/interop#preferredScope': preferredScope.replace(
                'interop:',
                'http://www.w3.org/ns/solid/interop#'
              )
            },
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.find((a: any) => arraysEqual(a['interop:accessMode'], accessMode));
      }
    }
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
