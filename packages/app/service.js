const AccessNeedsService = require('./services/access-needs');
const AccessNeedsGroupsService = require('./services/access-needs-groups');
const ActorsService = require('./services/actors');
const AppRegistrationsService = require('./services/app-registrations');
const AccessGrantsService = require('./services/access-grants');
const DataGrantsService = require('./services/data-grants');
const PodProxyService = require('./services/pod-proxy');
const RegistrationService = require('./services/registration');

module.exports = {
  name: 'app',
  settings: {
    app: {
      name: null,
      description: null,
      author: null,
      thumbnail: null
    },
    oidc: {
      clientUri: null,
      redirectUris: null,
      postLogoutRedirectUris: [],
      tosUri: null
    },
    accessNeeds: {
      required: [],
      optional: []
    }
  },
  dependencies: [
    'activitypub',
    'activitypub.follow', // Ensure the /followers and /following collection are registered
    'auth.account',
    'ldp.container',
    'ldp.registry'
  ],
  created() {
    this.broker.createService(ActorsService, {
      settings: {
        app: this.settings.app,
        oidc: this.settings.oidc
      }
    });

    this.broker.createService(RegistrationService);

    this.broker.createService(AccessNeedsService);
    this.broker.createService(AccessNeedsGroupsService, {
      settings: {
        accessNeeds: this.settings.accessNeeds
      }
    });

    this.broker.createService(AppRegistrationsService);
    this.broker.createService(DataGrantsService);
    this.broker.createService(AccessGrantsService);

    this.broker.createService(PodProxyService);
  },
  async started() {
    await this.broker.waitForServices(['actors'], 10000);
    await this.broker.call('actors.createApp');
  }
};
