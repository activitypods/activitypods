const ProfileService = require('./services/profile');
const LocationService = require('./services/location');
const ContactGroupsService = require('./services/contactgroup');
const CapabilitiesProfileService = require('./services/capabilities-profile');

const ProfilesApp = {
  name: 'profiles',
  settings: {
    publicProfile: false
  },
  created() {
    this.broker.createService({
      mixins: [ProfileService],
      settings: {
        publicProfile: this.settings.publicProfile
      }
    });

    this.broker.createService({ mixins: [LocationService] });

    this.broker.createService({ mixins: [ContactGroupsService] });

    this.broker.createService({ mixins: [CapabilitiesProfileService] });
  }
};

module.exports = ProfilesApp;
