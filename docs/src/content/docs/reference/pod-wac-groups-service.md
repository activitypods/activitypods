---
title: PodWacGroupsService
---

This service, automatically created by the AppService with the key `pod-wac-groups`, allows you to manage WAC groups. See [this page](../../backend/handling-permissions) for usage examples.

## Actions

The following service actions are available.

### `get`

Get the members of a group.

#### Parameters

| Property    | Type     | Description                                                     |
| ----------- | -------- | --------------------------------------------------------------- |
| `groupUri`  | `String` | URI of the group                                                |
| `groupSlug` | `String` | Slug of the group. Used to find the `groupUri` if not provided. |
| `actorUri`  | `String` | WebID of the Pod on which the action should be done             |

#### Return value

An array with the WebID of the group members.

### `list`

Get the list of all available groups on the Pod.

#### Parameters

| Property   | Type     | Description                                         |
| ---------- | -------- | --------------------------------------------------- |
| `actorUri` | `String` | WebID of the Pod on which the action should be done |

#### Return value

An array with the URI of all the groups on the Pod.

### `create`

Create a new WAC group on the Pod.

#### Parameters

| Property    | Type     | Description                                                   |
| ----------- | -------- | ------------------------------------------------------------- |
| `groupSlug` | `String` | Desired slug for the group. Will be "slugified" if necessary. |
| `actorUri`  | `String` | WebID of the Pod on which the action should be done           |

#### Return value

The URI of the newly-created group, e.g. `http://localhost:3000/_groups/{username}/{group-slug}`

### `delete`

Delete a WAC group from the Pod.

#### Parameters

| Property    | Type     | Description                                                     |
| ----------- | -------- | --------------------------------------------------------------- |
| `groupUri`  | `String` | URI of the group                                                |
| `groupSlug` | `String` | Slug of the group. Used to find the `groupUri` if not provided. |
| `actorUri`  | `String` | WebID of the Pod on which the action should be done             |

#### Return value

True if the operation succeeded.

### `addMember`

Add a member to a WAC group.

#### Parameters

| Property    | Type     | Description                                                    |
| ----------- | -------- | -------------------------------------------------------------- |
| `groupUri`  | `String` | URI of the group                                               |
| `groupSlug` | `String` | Slug of the group. Used to find the `groupUri` if not provided |
| `memberUri` | `String` | URI of an agent to be added to the group                       |
| `actorUri`  | `String` | WebID of the Pod on which the action should be done            |

#### Return value

True if the operation succeeded.

### `removeMember`

Remove a member from a WAC group.

#### Parameters

| Property    | Type     | Description                                                    |
| ----------- | -------- | -------------------------------------------------------------- |
| `groupUri`  | `String` | URI of the group                                               |
| `groupSlug` | `String` | Slug of the group. Used to find the `groupUri` if not provided |
| `memberUri` | `String` | URI of an agent to be removed from the group                   |
| `actorUri`  | `String` | WebID of the Pod on which the action should be done            |

#### Return value

True if the operation succeeded.
