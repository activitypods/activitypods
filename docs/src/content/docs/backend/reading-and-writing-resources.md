---
title: Reading and writing resources
sidebar:
  order: 2
---

Writing and reading resources on the user's Pod is easy thanks to the [LDP specification](../design/resources-management.md) and to the [proxy endpoint](../design/authentication.md). But to make it even easier, we provide two tools.

## `PodResourcesService`

If you need to read or write data to the Pod, you can use the `PodResourcesService`. It implements the `post`, `list`, `get`, `put`, `patch`and`delete`actions in a very similar way to the`LdpResourceService`and`LdpContainerService`, except that you have to specify the Pod you want to write to using the `actorUri` parameter.

```js
await ctx.call('pod-resources.get`, {
  resourceUri: 'http://localhost:3000/alice/data/ede2d5f6-0497-409e-b192',
  actorUri: 'http://localhost:3000/alice'
});
```

:::tip[Remote resources]
If the resources you want to fetch is not in the Pod of the user (`actorUri`) but on another Pod, the service will automatically pass through the [proxy endpoint](../design/authentication.md#proxy-endpoint) of the user. However the proxy endpoint will only allow you to read or write data that you requested during the registration.
:::

## `PodResourcesHandlerMixin`

Since your application is likely to deal only with certain types of data, you can use the `PodResourcesHandlerMixin' to interact with the Pod more easily. This mixin contains the same type of actions as the `PodResourcesMixin`, except that you don't need to provide the containerUri for the `post`and`list` actions.

You can also configure the `onCreate`, `onUpdate`, and `onDelete` methods to listen for changes in the Pod. When you define one of these methods, the mixin will automatically watch for `Create`, `Update`, and `Delete` activities related to these resources, thanks to the [`PodActivitiesWatcherService`](listening-to-inbox-and-outbox.md#podactivitieswatcherservice).

```js
const { triple, namedNode, literal } = require('@rdfjs/data-model');
const { PodResourcesHandlerMixin } = require('@activitypods/app');

module.exports = {
  name: 'events',
  mixins: [PodResourcesHandlerMixin],
  settings: {
    type: 'Event'
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
