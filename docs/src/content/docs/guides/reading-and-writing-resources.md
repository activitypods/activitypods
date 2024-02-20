---
title: Reading and writing resources
sidebar:
  order: 2
---

Writing and reading resources on the user's Pod

## `PodsResourcesService`

If you need to read or write data on the Pod, you can use the `PodsResourcesService`. It implements `post`, `list`, `get`, `put`, `patch` and `delete` actions, in a way very similar to the `LdpResourceService` and `LdpContainerService`, except you need to indicate the Pod you want to write to using the `actorUri` parameter.

```js
await ctx.call('pod-resources.get`, { resourceUri, actorUri });
```

:::tip[Remote resources]
If the resources you want to fetch is not in the Pod of the user (`actorUri`) but on another Pod, the service will automatically pass through the [proxy endpoint](../design/authentication.md#proxy-endpoint) of the user. However the proxy endpoint will only allow you to read or write data that you requested during the registration.
:::
