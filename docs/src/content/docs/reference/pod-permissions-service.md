---
title: PodPermissionService
---

This service, automatically created by the AppService with the key `pod-permissions`, allows you to manage WAC permissions on resources, containers and collections. See [this page](../../backend/handling-permissions) for usage examples.

## Actions

The following service actions are available.

### `get`

Get permissions of a resource, container or collection.

#### Parameters

| Property   | Type     | Description                                         |
| ---------- | -------- | --------------------------------------------------- |
| `uri`      | `String` | URI of the resource, container or collection        |
| `actorUri` | `String` | WebID of the Pod on which the action should be done |

#### Return value

An array with `acl:Authorization` resources associated with the resource.

### `add`

Add permissions to a resource, container or collection.

#### Parameters

| Property         | Type     | Description                                                   |
| ---------------- | -------- | ------------------------------------------------------------- |
| `uri`            | `String` | URI of the resource, container or collection                  |
| `agentUri`       | `String` | URI of the agent which will receive the permission            |
| `agentPredicate` | `String` | Can be `acl:agent`, `acl:agentGroup` or `acl:agentClass`      |
| `mode`           | `String` | Can be `acl:Read`, `acl:Append`, `acl:Write` or `acl:Control` |
| `actorUri`       | `String` | WebID of the Pod on which the action should be done           |

#### Return value

True if the operation succeeded.

### `remove`

Remove permissions from a resource, container or collection.

#### Parameters

| Property         | Type     | Description                                                   |
| ---------------- | -------- | ------------------------------------------------------------- |
| `uri`            | `String` | URI of the resource, container or collection                  |
| `agentUri`       | `String` | URI of the agent which will receive the permission            |
| `agentPredicate` | `String` | Can be `acl:agent`, `acl:agentGroup` or `acl:agentClass`      |
| `mode`           | `String` | Can be `acl:Read`, `acl:Append`, `acl:Write` or `acl:Control` |
| `actorUri`       | `String` | WebID of the Pod on which the action should be done           |

#### Return value

True if the operation succeeded.
