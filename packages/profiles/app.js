const ProfileService = require('./services/profile');
const LocationService = require('./services/location');
const ContactGroupsService = require('./services/contactgroup');
const CapabilitiesProfileService = require('./services/capabilities-profile-service');

const ProfilesApp = {
  name: 'profiles',
  settings: {
    publicProfile: false
  },
  created() {
    this.broker.createService(ProfileService, {
      settings: {
        publicProfile: this.settings.publicProfile
      }
    });

    this.broker.createService(LocationService);

    this.broker.createService(ContactGroupsService);

    this.broker.createService(CapabilitiesProfileService);
  }
};

module.exports = ProfilesApp;
