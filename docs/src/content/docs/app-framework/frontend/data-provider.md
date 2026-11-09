---
title: Data provider
sidebar:
  order: 2
---

The data provider reads and writes resources on the Pod of the logged user. It finds the container of each resource by looking at the user's type index, so the app must have declared the corresponding [access needs](../../backend/application-registration/), and the user must have granted them.

## Configuration

```ts
import { authProvider, dataProvider } from '@activitypods/refine-providers';

const apAuthProvider = authProvider({ clientId: 'http://localhost:3001/app' });

export default dataProvider({
  authProvider: apAuthProvider,
  resources: {
    events: {
      // Recommended: the shape tree used in the access needs
      shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/as/Event'
    },
    notes: {
      // Alternative: the types of the resource
      types: ['as:Note']
    }
  },
  jsonContext: ['https://www.w3.org/ns/activitystreams', 'http://localhost:3001/.well-known/context.jsonld']
});
```

The keys of `resources` are the names of your Refine resources. The `jsonContext` is used to compact the resources and to expand the types. Add your backend's context to it if your app uses other ontologies than ActivityStreams.

Records are JSON-LD objects compacted with this context. Their `id` is the URI of the resource, so you will see encoded URIs in your app routes.

Resources shared by other users, such as the profiles of the user's contacts or the events they were invited to, are cached by the Pod in the user's containers, so they appear in the lists. When they are fetched individually, resources hosted on other servers are fetched through the proxy of the user's Pod, which signs the requests on behalf of the user.

With the `readAccessGrants: true` option, lists also include the resources found through the access grants of the app registration. This is slow, since every list fetches the app registration and the shared containers or resources, so it is disabled by default.

## Lists

`getList` supports Refine's `filters`, `sorters` and `pagination`. With `pagination: { mode: 'server' }` (the default of `useTable`), only one page is fetched: the Pod pages, sorts and filters the container. This is possible with one sorter and these filters:

- `{ field: 'q', operator: 'contains', value }`: search in all the fields of the resources
- `{ field, operator: 'contains', value }`: search in a field, or in several fields with an `or` filter whose children have the same value
- `{ field: 'near', operator: 'eq', value: { latitude, longitude, radius } }`: keep the resources whose `vcard:hasGeo` is within `radius` km, or which have no location

Searches are case and accent insensitive. Strings are sorted by code points, so case and accents matter. Other filters and sorters are applied in memory, after fetching the whole container.

```tsx
const { result } = useInfiniteList({
  resource: 'contacts',
  pagination: { pageSize: 20, mode: 'server' },
  sorters: [{ field: 'vcard:given-name', order: 'asc' }],
  filters: [{ field: 'vcard:given-name', operator: 'contains', value: search }]
});
```

## Live updates

The live provider uses [WebSocket channels](https://solid.github.io/notifications/websocket-channel-2023) to refresh the pages when resources are created, updated or deleted. Give it the same `resources` and `jsonContext` as the data provider:

```tsx
import { liveProvider } from '@activitypods/refine-providers';

<Refine
  liveProvider={liveProvider({ authProvider, resources, jsonContext })}
  options={{ liveMode: 'auto' }}
  ...
/>
```

A list is notified when resources are added to or removed from the container, but not when a resource is updated.

:::caution
Live updates require Pod providers running a version of ActivityPods above 2.3.15.
:::
