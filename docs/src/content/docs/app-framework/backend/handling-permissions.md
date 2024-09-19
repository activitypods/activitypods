---
title: Handling permissions
sidebar:
  order: 5
---

In Solid, permissions are handled through a standard called [Web Access Control](../../architecture/authorization.md#web-access-control-wac) (or WAC).

## Adding or removing WAC permissions

To add or remove permissions from a Pod, the app can use the [`PodPermissionsService`](../../reference/pod-permissions-service).

```js
await ctx.call('pod-permissions.add', {
  uri: 'http://localhost:3000/alice/data/eba0227a-3bbb-4582-b879,
  agentUri: 'http://localhost:3000/bob',
  agentPredicate: 'acl:agent',
  mode: 'acl:Read',
  actorUri: 'http://localhost:3000/alice'
});
```

To give a permission to all users, you should use `acl:agentClass` for the `agentPredicate` and `http://xmlns.com/foaf/0.1/Agent` for the `agentUri`.

## Creating WAC groups

The [`PodWacGroupsService`](../../reference/pod-wac-groups-service) allows you to create or delete WAC groups, as well as add or remove members from these groups.

```js
const groupUri = await ctx.call('pod-wac-groups.create', {
  groupSlug: 'my-group',
  actorUri: 'http://localhost:3000/alice'
});

await ctx.call('pod-wac-groups.addMember', {
  groupUri,
  memberUri: 'http://localhost:3000/bob',
  actorUri: 'http://localhost:3000/alice'
});
```

You can then give permissions to the whole group using `pod-permissions.add`,with `acl:agentGroup` for the `agentPredicate` and the URI of the group for the `agentUri`.

:::note
Your application must have requested the `apods:CreateAclGroup` special right or these operations will fail.
:::
