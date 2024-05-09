const urlJoin = require('url-join');
const { OBJECT_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'pod-notifications',
  settings: {
    frontUrl: null
  },
  async started() {
    for (const [name, fn] of Object.entries(this.settings.handlebars.helpers)) {
      this.logger.info(`Registering handlebars helper ${name}`);
      Handlebars.registerHelper(name, fn);
    }
  },
  actions: {
    async send(ctx) {
      const { template, recipientUri, activity, context, ...rest } = ctx.params;

      const app = await ctx.call('app.get');

      let templateParams = {};

      if (activity) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: activity.actor });
        let emitterProfile = {};
        try {
          emitterProfile = emitter.url
            ? await ctx.call('pod-resources.get', { resourceUri: emitter.url, actorUri: recipientUri })
            : {};
        } catch (e) {
          this.logger.warn(`Could not get profile of actor ${activity.actor}`);
        }
        templateParams = { activity, emitter, emitterProfile, ...rest };
      } else {
        templateParams = { ...rest };
      }

      const { title, content, actions } = await ctx.call('translator.translate', {
        template,
        templateParams,
        actorUri: recipientUri
      });

      await ctx.call('activitypub.outbox.post', {
        collectionUri: app.outbox,
        type: [OBJECT_TYPES.NOTE, 'apods:Notification'],
        actor: app.id,
        name: title,
        content: content,
        url: actions?.map(action => ({
          type: 'Link',
          name: action.caption,
          href: action.link.startsWith('http') ? action.link : urlJoin(this.settings.frontUrl, action.link)
        })),
        to: recipientUri,
        context
      });
    }
  }
};
