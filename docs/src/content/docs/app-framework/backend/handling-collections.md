---
title: Handling collections
sidebar:
  order: 6
---

In ActivityPub, [ActivityStreams collections](https://www.w3.org/TR/activitystreams-core/#collections) are frequently used to handle side-effects. For example, when a `Follow` activity is sent, the actor is added to the `as:followers` collection.

ActivityPods make it easy to create custom collections, thanks to the [collection API](/architecture/resources-management/#collections) provided by SemApps. The service and mixin below make us of this API to easily handle collections.

## Creating an unordered collection

Here's how an app can create a custom "Friends" collection and attach it to Alice webId:

```js
const aliceFriendsCollectionUri = await ctx.call('pod-collections.createAndAttach', {
  objectUri: 'http://localhost:3000/alice',
  attachPredicate: 'http://activitypods.org/ns/core#friends',
  collectionOptions: {
    ordered: false,
    summary: 'Alice friends',
    dereferenceItems: false
  },
  actorUri: 'http://localhost:3000/alice'
});
```

See the [this page`](/reference/pod-collections-service/#collection-options) for available collection options.

## Creating an ordered collection

Here's how to create an ordered collection:

```js
await ctx.call('pod-collections.createAndAttach', {
  objectUri: 'http://localhost:3000/alice',
  attachPredicate: 'http://activitypods.org/ns/core#latestNotes',
  collectionOptions: {
    ordered: true,
    summary: 'Alice latest notes',
    dereferenceItems: true,
    sortPredicate: 'dc:created',
    sortOrder: 'semapps:DescOrder'
  },
  actorUri: 'http://localhost:3000/alice'
});
```

See the [this page`](/reference/pod-collections-service/#collection-options) for available collection options.

:::note
The example above require the `apods:UpdateWebId` special right since you are modifying Alice webId.
:::

## Adding or removing items

Once the collection is created, adding items is pretty straightforward:

```js
await ctx.call('pod-collections.add', {
  collectionUri: aliceFriendsCollectionUri,
  itemUri: 'http://localhost:3000/bob'
  actorUri: 'http://localhost:3000/alice'
});
```

## Automatically attaching collections to objects

The previous method works well if you want to create collections only on some occasions. But if you want a collection to be attached to all resources of a certain type, you can use the `PodCollectionsHandlerMixin`

```js
const { PodCollectionsHandlerMixin } = require('@activitypods/app');

module.exports = {
  name: 'attendees',
  mixins: [PodCollectionsHandlerMixin],
  settings: {
    type: 'as:Event',
    attachPredicate: 'http://activitypods.org/ns/core#attendees',
    collectionOptions: {
      ordered: false,
      summary: 'Event attendees'
    }
  }
};
```

With this new service, the application will listen for creation of resources of type `as:Event` on the Pods it is installed, and automatically create and attach the collections.

If you want to attach collections to existing resources of type `as:Event`, you can call the `addMissingCollections` action.
