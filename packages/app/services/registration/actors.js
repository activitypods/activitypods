const { ControlledContainerMixin, ControlledContainerDereferenceMixin } = require('@semapps/ldp');
const { ACTOR_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'actors',
  mixins: [ControlledContainerMixin, ControlledContainerDereferenceMixin],
  settings: {
    path: '/as/actor',
    acceptedTypes: [ACTOR_TYPES.APPLICATION, 'interop:Application'],
    readOnly: true,
    dereferencePlan: [{ property: 'publicKey' }, { property: 'assertionMethod' }]
  }
};
