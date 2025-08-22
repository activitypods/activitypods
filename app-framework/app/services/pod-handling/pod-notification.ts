import urlJoin from 'url-join';
import { OBJECT_TYPES } from '@semapps/activitypub';
// @ts-expect-error TS(2305): Module '"moleculer"' has no exported member 'defin... Remove this comment to see the full error message
import { ServiceSchema } from 'moleculer';

const PodNotificationsSchema = {
  name: 'pod-notifications' as const,
  settings: {
    frontUrl: null
  },
  actions: {
    send: {
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
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
          url: actions?.map((action: any) => ({
            type: 'Link',
            name: action.caption,
            href: action.link.startsWith('http') ? action.link : urlJoin(this.settings.frontUrl, action.link)
          })),
          to: recipientUri,
          context
        });
      }
    }
  }
} satisfies ServiceSchema;

export default PodNotificationsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [PodNotificationsSchema.name]: typeof PodNotificationsSchema;
    }
  }
}
