// @ts-expect-error TS(7016): Could not find a declaration file for module 'mole... Remove this comment to see the full error message
import QueueMixin from 'moleculer-bull';
// @ts-expect-error TS(6059): File '/home/laurin/projects/virtual-assembly/semap... Remove this comment to see the full error message
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
import { ServiceSchema } from 'moleculer';

const AppSchema = {
  name: 'app' as const,
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

    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [ActorsService] });

    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [RegistrationService] });

    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [AccessNeedsService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [AccessNeedsGroupsService] });

    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [AppRegistrationsService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [AccessGrantsService] });

    // Pod handling
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({
      mixins: [PodActivitiesWatcherService, QueueMixin(this.settings.queueServiceUrl)]
    });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({
      mixins: [PodNotificationService],
      settings: {
        frontUrl: this.settings.app.frontUrl
      }
    });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodCollectionsService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodContainersService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodOutboxService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodPermissionsService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodResourcesService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodWacGroupsService] });

    // Utils
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [ShaclService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [ShapeTreesService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({
      mixins: [TimerService, QueueMixin(this.settings.queueServiceUrl)]
    });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [TranslatorService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
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

    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    await this.broker.call('access-needs-groups.createOrUpdate', {
      accessNeeds: {
        // Ensure we have one key per necessity, otherwise we may fail to delete unused access needs
        required: arrayOf(accessNeeds.required),
        optional: arrayOf(accessNeeds.optional)
      }
    });
  },
  actions: {
    get: {
      handler() {
        return this.appActor;
      }
    }
  }
} satisfies ServiceSchema;

export default AppSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AppSchema.name]: typeof AppSchema;
    }
  }
}
