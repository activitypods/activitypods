const { getContainerFromUri } = require('@semapps/ldp');
const { matchActivity } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');

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

    for (const { grantedBy, specialRights } of nodes) {
      try {
        const actor = await this.broker.call('activitypub.actor.get', { actorUri: grantedBy.value });

        switch (specialRights.value) {
          case 'http://activitypods.org/ns/core#ReadInbox':
            this.logger.info(`Listening to ${actor.id} inbox...`);
            await this.broker.call('solid-notifications.listener.register', {
              resourceUri: actor.inbox,
              actionName: 'activities-listener.processWebhook'
            });
            break;

          case 'http://activitypods.org/ns/core#ReadOutbox':
            this.logger.info(`Listening to ${actor.id} outbox...`);
            await this.broker.call('solid-notifications.listener.register', {
              resourceUri: actor.outbox,
              actionName: 'activities-listener.processWebhook'
            });
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
        const resource = await ctx.call('pod-proxy.get', { resourceUri, actorUri });
        return resource;
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

      const actor = await ctx.call('activitypub.actor.get', { actorUri: appRegistration['interop:registeredBy'] });

      // If we were given the permission to read the inbox, add listener
      if (arrayOf(accessGrants['apods:hasSpecialRights']).includes('apods:ReadInbox')) {
        this.logger.info(`Listening to ${actor.id} inbox...`);
        await ctx.call('solid-notifications.listener.register', {
          resourceUri: actor.inbox,
          actionName: 'activities-listener.processWebhook'
        });
      }

      // If we were given the permission to read the inbox, add listener
      if (arrayOf(accessGrants['apods:hasSpecialRights']).includes('apods:ReadOutbox')) {
        this.logger.info(`Listening to ${actor.id} outbox...`);
        await ctx.call('solid-notifications.listener.register', {
          resourceUri: actor.outbox,
          actionName: 'activities-listener.processWebhook'
        });
      }
    }
  }
};
