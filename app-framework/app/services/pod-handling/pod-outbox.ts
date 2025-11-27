import { ServiceSchema } from 'moleculer';

const PodOutboxSchema = {
  name: 'pod-outbox' as const,
  actions: {
    post: {
      async handler(ctx: any) {
        let { activity, actorUri } = ctx.params;

        // Adds the default context, if it is missing
        if (!activity['@context']) {
          activity = {
            '@context': await ctx.call('jsonld.context.get'),
            ...activity
          };
        }

        const appUri = await ctx.call('app.getUri');

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
    }
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
