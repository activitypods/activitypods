const QueueMixin = require('moleculer-bull');
const { triple, namedNode } = require('@rdfjs/data-model');
const { arrayOf } = require('@semapps/ldp');
const AccessDescriptionSetService = require('./services/registration/access-description-sets');
const AccessNeedsService = require('./services/registration/access-needs');
const AccessNeedsGroupsService = require('./services/registration/access-needs-groups');
const ActorsService = require('./services/registration/actors');
const AppRegistrationsService = require('./services/registration/app-registrations');
const AccessGrantsService = require('./services/registration/access-grants');
const ClassDescriptionService = require('./services/registration/class-descriptions');
const DataGrantsService = require('./services/registration/data-grants');
const RegistrationService = require('./services/registration/registration');
const PodActivitiesWatcherService = require('./services/pod-handling/pod-activities-watcher');
const PodCollectionsService = require('./services/pod-handling/pod-collections');
const PodContainersService = require('./services/pod-handling/pod-containers');
const PodNotificationService = require('./services/pod-handling/pod-notification');
const PodOutboxService = require('./services/pod-handling/pod-outbox');
const PodPermissionsService = require('./services/pod-handling/pod-permissions');
const PodResourcesService = require('./services/pod-handling/pod-resources');
const PodWacGroupsService = require('./services/pod-handling/pod-wac-groups');
const TimerService = require('./services/utils/timer');
const TranslatorService = require('./services/utils/translator');

module.exports = {
  name: 'app',
  settings: {
    baseUrl: null,
    app: {
      name: null,
      description: null,
      author: null,
      thumbnail: null,
      frontUrl: null
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
    },
    classDescriptions: {},
    queueServiceUrl: null
  },
  dependencies: [
    'activitypub',
    'activitypub.follow', // Ensure the /followers and /following collection are registered
    'auth.account',
    'ldp.container',
    'ldp.registry',
    'ldp.resource',
    'actors',
    'access-needs-groups',
    'class-descriptions',
    'access-description-sets'
  ],
  created() {
    if (!this.settings.queueServiceUrl) {
      throw new Error(`The setting queueServiceUrl is mandatory`);
    }

    this.broker.createService({ mixins: [ActorsService] });

    this.broker.createService({ mixins: [RegistrationService] });

    this.broker.createService({ mixins: [AccessNeedsService] });
    this.broker.createService({ mixins: [AccessNeedsGroupsService] });

    this.broker.createService({ mixins: [AppRegistrationsService] });
    this.broker.createService({ mixins: [DataGrantsService] });
    this.broker.createService({ mixins: [AccessGrantsService] });

    this.broker.createService({ mixins: [AccessDescriptionSetService] });
    this.broker.createService({ mixins: [ClassDescriptionService] });

    // Pod handling
    this.broker.createService({
      mixins: [PodActivitiesWatcherService, QueueMixin(this.settings.queueServiceUrl)]
    });
    this.broker.createService({
      mixins: [PodNotificationService],
      settings: {
        frontUrl: this.settings.app.frontUrl
      }
    });
    this.broker.createService({ mixins: [PodCollectionsService] });
    this.broker.createService({ mixins: [PodContainersService] });
    this.broker.createService({ mixins: [PodOutboxService] });
    this.broker.createService({ mixins: [PodPermissionsService] });
    this.broker.createService({ mixins: [PodResourcesService] });
    this.broker.createService({ mixins: [PodWacGroupsService] });

    // Utils
    this.broker.createService({
      mixins: [TimerService, QueueMixin(this.settings.queueServiceUrl)]
    });
    this.broker.createService({ mixins: [TranslatorService] });
  },
  async started() {
    const { app, oidc, accessNeeds, classDescriptions } = this.settings;

    this.appActor = await this.broker.call('actors.createOrUpdateApp', { app, oidc });

    // TODO Ensure this doesn't add a link on every call
    await this.broker.call('nodeinfo.addLink', {
      rel: 'https://www.w3.org/ns/activitystreams#Application',
      href: this.appActor.id
    });

    await this.broker.call('access-needs-groups.createOrUpdate', {
      accessNeeds: {
        // Ensure we have one key per necessity, otherwise we may fail to delete unused access needs
        required: arrayOf(accessNeeds.required),
        optional: arrayOf(accessNeeds.optional)
      }
    });

    await this.broker.call('access-description-sets.createOrUpdate', { classDescriptions, appUri: this.appActor.id });
  },
  actions: {
    get() {
      return this.appActor;
    }
  }
};
