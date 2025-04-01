const { ControlledContainerMixin } = require('@semapps/ldp');
const AgentRegistrationsMixin = require('../../mixins/agent-registrations');

module.exports = {
  name: 'social-agent-registrations',
  mixins: [ControlledContainerMixin, AgentRegistrationsMixin],
  settings: {
    acceptedTypes: ['interop:SocialAgentRegistration'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  }
};
