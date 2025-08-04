const PodOutboxSchema = {
  name: 'pod-outbox',
  actions: {
    async post(ctx) {
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
  }
};

export default PodOutboxSchema;
