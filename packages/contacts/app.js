const LocationService = require('./services/location');
const ProfileService = require('./services/profile');
const RequestService = require('./services/request');
const translations = require('./translations');

const ContactsApp = {
  name: 'contacts',
  dependencies: ['notification'],
  created() {
    this.broker.createService(ProfileService);

    this.broker.createService(LocationService);

    this.broker.createService(RequestService);
  },
  async started() {
    await this.broker.call('notification.loadTranslations', { translations });
  },
};

module.exports = ContactsApp;
