---
title: PodActivitiesWatcherService
---

This service, automatically created by the AppService with the key `pod-activities-watcher`, allows you to watch for certain type of activities, in the inbox or outbox of the Pod owner. See [this page](/app-framework/backend/listening-to-inbox-and-outbox) for usage examples.

## Actions

The following service actions are available.

### `watch`

Create a collection in the `/as/collection` container, and attach it to the provided resource.

#### Parameters

| Property     | Type     | Description                                                          |
| ------------ | -------- | -------------------------------------------------------------------- |
| `matcher`    | `Object` | Activity template to compare with the emitted or received activities |
| `boxTypes`   | `Array`  | An array with "inbox", "outbox" or both. What box to listen to.      |
| `actionName` | `String` | Moleculer action to call when there is a match                       |
| `key`        | `String` | A custom key that will be passed back to your action                 |
