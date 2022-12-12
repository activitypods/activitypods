const ManagerService = require('./services/manager');
const RequestService = require('./services/request');

const ContactsApp = {
  name: 'contacts',
  created() {
    this.broker.createService(ManagerService);

    this.broker.createService(RequestService);
  },
};

module.exports = ContactsApp;
