import { getContainerFromUri, arrayOf, isObject, isURL } from '@semapps/ldp';
import { matchActivity } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { objectDepth } from '../../utils.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const queueOptions =
  process.env.NODE_ENV === 'test'
    ? {}
    : {
        // Keep completed jobs for 3 days
        removeOnComplete: { age: 259200 },
        // Try again after 3 minutes and until 48 hours later
        // Method to calculate it: Math.round((Math.pow(2, attemptsMade) - 1) * delay)
        attempts: 10,
        backoff: { type: 'exponential', delay: '180000' }
      };

const PodActivitiesWatcherSchema = {
  name: 'pod-activities-watcher' as const,
  dependencies: ['triplestore', 'ldp', 'activitypub.actor', 'solid-notifications.listener'],
  async started() {
    const nodes = await this.broker.call('triplestore.query', {
      query: `
        SELECT DISTINCT ?specialRights ?actorUri
        WHERE { 
          ?appRegistration a <http://www.w3.org/ns/solid/interop#ApplicationRegistration> .
          ?appRegistration <http://activitypods.org/ns/core#hasSpecialRights> ?specialRights .
          ?appRegistration <http://www.w3.org/ns/solid/interop#registeredBy> ?actorUri
        }
      `,
      accept: MIME_TYPES.JSON,
      webId: 'system'
    });

    // On (re)start, delete existing queue
    this.getQueue('registerListener').clean(0);
    this.getQueue('registerListener').clean(0, 'failed');
    this.getQueue('registerListener').empty();

    for (const { actorUri, specialRights } of nodes) {
      try {
        switch (specialRights.value) {
          case 'http://activitypods.org/ns/core#ReadInbox':
            this.createJob(
              'registerListener',
              actorUri.value + ' inbox',
              { actorUri: actorUri.value, collectionPredicate: 'inbox' },
              queueOptions
            );
            break;

          case 'http://activitypods.org/ns/core#ReadOutbox':
            this.createJob(
              'registerListener',
              actorUri.value + ' outbox',
              { actorUri: actorUri.value, collectionPredicate: 'outbox' },
              queueOptions
            );
            break;
        }
      } catch (e) {
        this.logger.warn(`Could not listen to actor ${actorUri.value}. Error message: ${e.message}`);
      }
    }

    this.handlers = [];

    this.baseUrl = await this.broker.call('ldp.getBaseUrl');
  },
  actions: {
    watch: defineAction({
      async handler(ctx) {
        const { matcher, actionName, boxTypes, key } = ctx.params;

        this.handlers.push({ matcher, actionName, boxTypes, key });

        this.sortHandlers();
      }
    }),

    processWebhook: defineAction({
      async handler(ctx) {
        const { type, object, target } = ctx.params;

        // Ignore Remove activities
        if (type !== 'Add') return;

        this.logger.info(`Detected activity ${object} in collection ${target}`);

        // TODO properly find the pod owner URI from the target
        // Apparently not specified by Solid https://forum.solidproject.org/t/discovering-webid-owner-of-a-particular-resource/2490
        const actorUri = getContainerFromUri(target);

        const actor = await ctx.call('activitypub.actor.get', { actorUri });

        // Use pod-resources.get instead of ldp.resource.get when getting pod resources
        const fetcher = async resourceUri => {
          if (resourceUri.startsWith(this.baseUrl)) {
            try {
              // TODO Do not throw errors on ldp.resource.get ! (should be done on the API layer)
              const resource = await ctx.call('ldp.resource.get', {
                resourceUri,
                accept: MIME_TYPES.JSON,
                webId: actorUri
              });
              return resource; // First get the resource, then return it, otherwise the try/catch will not work
            } catch (e) {
              if (e.status !== 401 && e.status !== 403 && e.status !== 404) {
                this.logger.error(`Could not fetch ${resourceUri}. Error ${e.status} ${e.statusText})`);
              }
              return false;
            }
          } else {
            const { ok, body } = await ctx.call('pod-resources.get', { resourceUri, actorUri });
            return ok && body;
          }
        };

        // Mastodon sometimes send unfetchable activities (like `Accept` activities)
        // In this case, the notification includes the whole activity, and we don't need to fetch it
        // TODO In the case of remote activities, get the cached activity to reduce risks of permission problems
        const activity = isURL(object) ? await fetcher(object) : object;
        if (!activity) {
          this.logger.warn(`Could not fetch activity ${object} received by ${actorUri}`);
          return false;
        }

        if (target === actor.inbox) {
          for (const handler of this.handlers) {
            if (handler.boxTypes.includes('inbox')) {
              const { match, dereferencedActivity } = await matchActivity(handler.matcher, activity, fetcher);
              if (match) {
                this.logger.info(`Reception of activity "${handler.key}" by ${actorUri} detected`);
                await ctx.call(handler.actionName, {
                  key: handler.key,
                  boxType: 'inbox',
                  dereferencedActivity,
                  actorUri
                });
              }
            }
          }
        } else if (target === actor.outbox) {
          for (const handler of this.handlers) {
            if (handler.boxTypes.includes('outbox')) {
              const { match, dereferencedActivity } = await matchActivity(handler.matcher, activity, fetcher);
              if (match) {
                this.logger.info(`Emission of activity "${handler.key}" by ${actorUri} detected`);
                await ctx.call(handler.actionName, {
                  key: handler.key,
                  boxType: 'outbox',
                  dereferencedActivity,
                  actorUri
                });
              }
            }
          }
        }
      }
    }),

    registerListenersFromAppRegistration: defineAction({
      async handler(ctx) {
        const { appRegistration } = ctx.params;

        // If we were given the permission to read the inbox, add listener
        if (arrayOf(appRegistration['apods:hasSpecialRights']).includes('apods:ReadInbox')) {
          this.createJob(
            'registerListener',
            appRegistration['interop:registeredBy'] + ' inbox',
            { actorUri: appRegistration['interop:registeredBy'], collectionPredicate: 'inbox' },
            queueOptions
          );
        }

        // If we were given the permission to read the inbox, add listener
        if (arrayOf(appRegistration['apods:hasSpecialRights']).includes('apods:ReadOutbox')) {
          this.createJob(
            'registerListener',
            appRegistration['interop:registeredBy'] + ' outbox',
            { actorUri: appRegistration['interop:registeredBy'], collectionPredicate: 'outbox' },
            appRegistration
          );
        }
      }
    }),

    getHandlers: defineAction({
      handler() {
        return this.handlers;
      }
    })
  },
  methods: {
    sortHandlers() {
      // Sort handlers by the depth of matchers (if matcher is a function, it is put at the end)
      this.handlers.sort((a, b) => {
        if (isObject(a.matcher)) {
          if (isObject(b.matcher)) {
            return objectDepth(a.matcher) - objectDepth(b.matcher);
          } else {
            return 1;
          }
        } else {
          if (isObject(b)) {
            return -1;
          } else {
            return 0;
          }
        }
      });
    }
  },
  queues: {
    registerListener: {
      name: '*',
      async process(job) {
        const { actorUri, collectionPredicate } = job.data;

        const actor = await this.broker.call('activitypub.actor.get', { actorUri });

        const listener = await this.broker.call('solid-notifications.listener.register', {
          resourceUri: actor[collectionPredicate],
          actionName: this.name + '.processWebhook'
        });

        this.logger.info(`Listening to ${actor.id} ${collectionPredicate}...`);

        return listener;
      }
    }
  }
} satisfies ServiceSchema;

export default PodActivitiesWatcherSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [PodActivitiesWatcherSchema.name]: typeof PodActivitiesWatcherSchema;
    }
  }
}
