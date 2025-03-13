---
title: Reading and writing resources
sidebar:
  order: 2
---

Writing and reading resources on the user's Pod is easy thanks to the [LDP specification](/architecture/resources-management/) and to the [proxy endpoint](/architecture/authentication).

## Reading and writing resources

If you need to read or write data to the Pod, you can use the [`PodResourcesService`](/reference/pod-resources-service/).

```js
const resourceUri = await ctx.call('pod-resources.post`, {
  containerUri: 'http://localhost:3000/alice/data/as/event',
  resource: {
    type: 'Event',
    name: 'Birthday party',
  }',
  actorUri: 'http://localhost:3000/alice'
});

const { body: resource } = await ctx.call('pod-resources.get`, {
  resourceUri,
  actorUri: 'http://localhost:3000/alice'
});
```

See the [`PodResourcesService`](/reference/pod-resources-service/) reference for all available actions.

:::tip[Remote resources]
If the resources you want to fetch is not in the Pod of the user (`actorUri`) but on another Pod, the service will automatically pass through the [proxy endpoint](../design/authentication.md#proxy-endpoint) of the user. However the proxy endpoint will only allow you to read or write data that you requested during the registration.
:::

### Creating a dedicated service

Since your application is likely to deal mainly with certain types of resources, you can use the `PodResourcesHandlerMixin` to interact with the Pod more easily. This mixin contains the same type of actions as the `PodResourcesMixin`, except that you don't need to provide the `containerUri` for the `post` and `list` actions: it will be automatically guessed based on the `type` setting of the mixin.

```js
const { PodResourcesHandlerMixin } = require('@activitypods/app');

module.exports = {
  name: 'events',
  mixins: [PodResourcesHandlerMixin],
  settings: {
    shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/as/Event'
  }
```

The `shapeTreeUri` must match a shape tree for which you requested access in the [application registration](../application-registration.md).

## Listening to resources changes

The `PodResourcesHandlerMixin` can also be used to listen for changes in the Pod. If you set the `onCreate`, `onUpdate`, or `onDelete` methods, the mixin will automatically watch for `Create`, `Update`, and `Delete` activities related to these resources, thanks to the [`PodActivitiesWatcherService`](listening-to-inbox-and-outbox.md#podactivitieswatcherservice).

```js
const { triple, namedNode, literal } = require('@rdfjs/data-model');
const { PodResourcesHandlerMixin } = require('@activitypods/app');

module.exports = {
  name: 'events',
  mixins: [PodResourcesHandlerMixin],
  settings: {
    type: 'as:Event'
  },
  methods: {
    async onCreate(ctx, resource, actorUri) {
      await this.actions.patch(
        {
          resourceUri: resource.id || resource['@id'],
          triplesToAdd: [
            triple(
              namedNode(resource.id || resource['@id']),
              namedNode('https://www.w3.org/ns/activitystreams#summary'),
              literal('An incredible AI-generated summary')
            )
          ],
          actorUri
        },
        { parentCtx: ctx }
      );
    },
    async onUpdate(ctx, resource, actorUri) {
      // Handle post-update actions
    },
    async onDelete(ctx, resource, actorUri) {
      // Handle post-delete actions
    }
  }
};
```
