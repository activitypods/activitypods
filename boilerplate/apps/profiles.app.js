const { ProfilesApp } = require('@activitypods/profiles');

module.exports = {
  mixins: [ProfilesApp],
  settings: {
    publicProfile: true
  }
};
