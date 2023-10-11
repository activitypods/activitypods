const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'access-needs-groups',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/access-needs-groups',
    acceptedTypes: ['interop:AccessNeedGroup'],
    readOnly: true
  }
};
