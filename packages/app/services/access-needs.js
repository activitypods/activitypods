const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'access-needs',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/access-needs',
    acceptedTypes: ['interop:AccessNeed'],
    readOnly: true
  }
};
