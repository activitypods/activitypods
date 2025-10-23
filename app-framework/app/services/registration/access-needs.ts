import { ControlledContainerMixin } from '@semapps/ldp';
import { necessityMapping } from '../../mappings.ts';
import { arraysEqual } from '../../utils.ts';
import { ServiceSchema } from 'moleculer';

const AccessNeedsSchema = {
  name: 'access-needs' as const,
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessNeed'],
    readOnly: true,
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
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
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
