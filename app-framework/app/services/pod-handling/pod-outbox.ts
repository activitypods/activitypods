// @ts-expect-error TS(2305): Module '"moleculer"' has no exported member 'defin... Remove this comment to see the full error message
import { ServiceSchema, defineAction } from 'moleculer';

const PodOutboxSchema = {
  name: 'pod-outbox' as const,
  actions: {
    post: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        let { activity, actorUri } = ctx.params;

        // Adds the default context, if it is missing
        if (!activity['@context']) {
          activity = {
            '@context': await ctx.call('jsonld.context.get'),
            ...activity
          };
        }

        const app = await ctx.call('app.get');
        const appUri = app.id || app['@id'];

        const actor = await ctx.call('activitypub.actor.get', { actorUri, webId: appUri });

        const response = await ctx.call('signature.proxy.query', {
          url: actor.outbox,
          method: 'POST',
          headers: {
            'Content-Type': 'application/ld+json'
          },
          body: JSON.stringify(activity),
          actorUri: appUri
        });

        if (response.ok) {
          return response.headers.location;
        } else {
          this.logger.error(
            `Could not POST to ${actorUri} outbox. Error ${response.status} (${response.statusText}). Body: ${JSON.stringify(activity)}`
          );
          return false;
        }
      }
    })
  }
} satisfies ServiceSchema;

export default PodOutboxSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [PodOutboxSchema.name]: typeof PodOutboxSchema;
    }
  }
}
