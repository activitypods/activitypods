const LocationService = require('./services/location');
const ProfileService = require('./services/profile');
const RequestService = require('./services/request');

const ContactsApp = {
  name: 'contacts',
  async created() {
    this.broker.createService(ProfileService);

    this.broker.createService(LocationService);

    this.broker.createService(RequestService);
  },
};

module.exports = ContactsApp;
