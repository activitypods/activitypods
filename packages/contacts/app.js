const ManagerService = require('./services/manager');
const RequestService = require('./services/request');

const ContactsApp = {
  name: 'contacts',
  created() {
    this.broker.createService({ mixins: [ManagerService] });

    this.broker.createService({ mixins: [RequestService] });
  }
};

module.exports = ContactsApp;
