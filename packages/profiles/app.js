const ProfileService = require('./services/profile');
const LocationService = require('./services/location');

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
  }
};

module.exports = ProfilesApp;
