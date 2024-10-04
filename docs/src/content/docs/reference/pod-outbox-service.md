---
title: PodOutboxService
---

This service, automatically created by the AppService with the key `pod-notification`, allows you to easily post as the Pod owner. See [this page](/app-framework/backend/posting-as-the-user) for usage examples.

## Actions

The following service actions are available.

### `post`

Post an activity as the Pod owner.

#### Parameters

| Property   | Type     | Description                                         |
| ---------- | -------- | --------------------------------------------------- |
| `activity` | `Object` | Activity to be posted                               |
| `actorUri` | `URI`    | WebID of the Pod on which the action should be done |

:::note
If no `@context` is provided for the resource, the default context of the application will be used.
:::
