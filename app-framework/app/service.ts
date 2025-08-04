import QueueMixin from 'moleculer-bull';
import { arrayOf } from '@semapps/ldp';
import AccessNeedsService from './services/registration/access-needs.ts';
import AccessNeedsGroupsService from './services/registration/access-needs-groups.ts';
import ActorsService from './services/registration/actors.ts';
import AppRegistrationsService from './services/registration/app-registrations.ts';
import AccessGrantsService from './services/registration/access-grants.ts';
import RegistrationService from './services/registration/registration.ts';
import PodActivitiesWatcherService from './services/pod-handling/pod-activities-watcher.ts';
import PodCollectionsService from './services/pod-handling/pod-collections.ts';
import PodContainersService from './services/pod-handling/pod-containers.ts';
import PodNotificationService from './services/pod-handling/pod-notification.ts';
import PodOutboxService from './services/pod-handling/pod-outbox.ts';
import PodPermissionsService from './services/pod-handling/pod-permissions.ts';
import PodResourcesService from './services/pod-handling/pod-resources.ts';
import PodWacGroupsService from './services/pod-handling/pod-wac-groups.ts';
import ShaclService from './services/utils/shacl.ts';
import ShapeTreesService from './services/utils/shape-trees.ts';
import TimerService from './services/utils/timer.ts';
import TranslatorService from './services/utils/translator.ts';
import MigrationService from './services/utils/migration.ts';

const AppSchema = {
  name: 'app',
  settings: {
    baseUrl: null,
    app: {
      name: null,
      description: null,
      author: null,
      thumbnail: null,
      frontUrl: null,
      authCallbackEndpoint: null, // If not defined, will use the front URL + /login?register_app=true
      supportedLocales: []
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
    'access-needs-groups'
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
    this.broker.createService({ mixins: [AccessGrantsService] });

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
    this.broker.createService({ mixins: [ShaclService] });
    this.broker.createService({ mixins: [ShapeTreesService] });
    this.broker.createService({
      mixins: [TimerService, QueueMixin(this.settings.queueServiceUrl)]
    });
    this.broker.createService({ mixins: [TranslatorService] });
    this.broker.createService({ mixins: [MigrationService], settings: { baseUrl: this.settings.baseUrl } });
  },
  async started() {
    const { app, oidc, accessNeeds } = this.settings;

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
  },
  actions: {
    get() {
      return this.appActor;
    }
  }
};

export default AppSchema;
