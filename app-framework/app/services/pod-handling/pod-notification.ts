import urlJoin from 'url-join';
import { OBJECT_TYPES } from '@semapps/activitypub';

const PodNotificationsSchema = {
  name: 'pod-notifications',
  settings: {
    frontUrl: null
  },
  actions: {
    async send(ctx) {
      const { template, recipientUri, activity, context, ...rest } = ctx.params;

      const app = await ctx.call('app.get');

      let templateParams = {};

      if (activity) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: activity.actor });
        let emitterProfile = {};
        if (emitter.url) {
          try {
            ({ body: emitterProfile } = await ctx.call('pod-resources.get', {
              resourceUri: emitter.url,
              actorUri: activity.actor
            }));
          } catch (e) {
            this.logger.warn(`Could not get profile of actor ${activity.actor}`);
          }
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

export default PodNotificationsSchema;
