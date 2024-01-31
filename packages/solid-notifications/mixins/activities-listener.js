const { getContainerFromUri } = require('@semapps/ldp');
const { matchActivity } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');

const queueOptions =
  process.env.NODE_ENV === 'test'
    ? {}
    : {
        // Try again after 3 minutes and until 12 hours later
        attempts: 8,
        backoff: { type: 'exponential', delay: '180000' }
      };

module.exports = {
  name: 'activities-listener',
  dependencies: ['triplestore', 'activitypub.actor', 'solid-notifications.listener'],
  async started() {
    const nodes = await this.broker.call('triplestore.query', {
      query: `
        SELECT DISTINCT ?specialRights ?grantedBy
        WHERE { 
          ?accessGrant a <http://www.w3.org/ns/solid/interop#AccessGrant> .
          ?accessGrant <http://activitypods.org/ns/core#hasSpecialRights> ?specialRights .
          ?accessGrant <http://www.w3.org/ns/solid/interop#grantedBy> ?grantedBy
        }
      `,
      accept: MIME_TYPES.JSON,
      webId: 'system'
    });

    // On (re)start, delete existing queue
    this.getQueue('registerListener').clean(0);
    this.getQueue('registerListener').clean(0, 'failed');
    this.getQueue('registerListener').empty();

    for (const { grantedBy, specialRights } of nodes) {
      try {
        switch (specialRights.value) {
          case 'http://activitypods.org/ns/core#ReadInbox':
            this.createJob(
              'registerListener',
              grantedBy.value + ' inbox',
              { actorUri: grantedBy.value, collectionPredicate: 'inbox' },
              queueOptions
            );
            break;

          case 'http://activitypods.org/ns/core#ReadOutbox':
            this.createJob(
              'registerListener',
              grantedBy.value + ' outbox',
              { actorUri: grantedBy.value, collectionPredicate: 'outbox' },
              queueOptions
            );
            break;
        }
      } catch (e) {
        this.logger.warn(`Could not listen to actor ${grantedBy.value}. Error message: ${e.message}`);
      }
    }
  },
  actions: {
    async processWebhook(ctx) {
      const { type, object, target } = ctx.params;

      // Ignore Remove activities
      if (type !== 'Add') return;

      // TODO properly find the pod owner URI from the target
      // Apparently not specified by Solid https://forum.solidproject.org/t/discovering-webid-owner-of-a-particular-resource/2490
      const actorUri = getContainerFromUri(target);

      const actor = await ctx.call('activitypub.actor.get', { actorUri });

      // TODO get the cached activity to ensure we have no authorization problems
      const activity = await ctx.call('pod-proxy.get', { resourceUri: object, actorUri });

      // Use pod-proxy.get instead of ldp.resource.get for matcher
      const fetcher = async (ctx, resourceUri) => {
        const { body } = await ctx.call('pod-proxy.get', { resourceUri, actorUri });
        return body;
      };

      if (actor.inbox === target) {
        for (const [key, activityHandler] of Object.entries(this.schema.activities)) {
          if (activityHandler.onReceive) {
            const dereferencedActivity = await matchActivity(ctx, activityHandler.match, activity, fetcher);
            if (!!dereferencedActivity) {
              this.logger.info(`Reception of activity "${key}" by ${actorUri} detected`);
              await activityHandler.onReceive.bind(this)(ctx, dereferencedActivity, actorUri);
            }
          }
        }
      } else if (actor.outbox === target) {
        for (const [key, activityHandler] of Object.entries(this.schema.activities)) {
          if (activityHandler.onEmit) {
            const dereferencedActivity = await matchActivity(ctx, activityHandler.match, activity, fetcher);
            if (!!dereferencedActivity) {
              this.logger.info(`Emission of activity "${key}" by ${actorUri} detected`);
              await activityHandler.onEmit.bind(this)(ctx, dereferencedActivity, actorUri);
            }
          }
        }
      }
    }
  },
  events: {
    async 'app.registered'(ctx) {
      const { accessGrants, appRegistration } = ctx.params;

      // If we were given the permission to read the inbox, add listener
      if (arrayOf(accessGrants['apods:hasSpecialRights']).includes('apods:ReadInbox')) {
        this.createJob(
          'registerListener',
          appRegistration['interop:registeredBy'] + ' inbox',
          { actorUri: appRegistration['interop:registeredBy'], collectionPredicate: 'inbox' },
          queueOptions
        );
      }

      // If we were given the permission to read the inbox, add listener
      if (arrayOf(accessGrants['apods:hasSpecialRights']).includes('apods:ReadOutbox')) {
        this.createJob(
          'registerListener',
          appRegistration['interop:registeredBy'] + ' outbox',
          { actorUri: appRegistration['interop:registeredBy'], collectionPredicate: 'outbox' },
          queueOptions
        );
      }
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
          actionName: 'activities-listener.processWebhook'
        });

        this.logger.info(`Listening to ${actor.id} ${collectionPredicate}...`);

        return listener;
      }
    }
  }
};
