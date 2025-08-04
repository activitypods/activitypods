import { ControlledContainerMixin } from '@semapps/ldp';
import { necessityMapping } from '../../mappings.ts';
import { arraysEqual } from '../../utils.ts';

const AccessNeedsSchema = {
  name: 'access-needs',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessNeed'],
    readOnly: true,
    activateTombstones: false
  },
  actions: {
    put() {
      throw new Error(`The resources of type interop:AccessNeed are immutable`);
    },
    patch() {
      throw new Error(`The resources of type interop:AccessNeed are immutable`);
    },
    async find(ctx) {
      const { shapeTreeUri, accessMode, necessity, preferredScope } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#registeredShapeTree': shapeTreeUri,
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

      return filteredContainer['ldp:contains']?.find(a => arraysEqual(a['interop:accessMode'], accessMode));
    }
  }
};

export default AccessNeedsSchema;
