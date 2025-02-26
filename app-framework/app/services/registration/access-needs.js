const { ControlledContainerMixin } = require('@semapps/ldp');
const { necessityMapping } = require('../../mappings');
const { arraysEqual } = require('../../utils');

module.exports = {
  name: 'access-needs',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessNeed'],
    permissions: {},
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
  }
};
