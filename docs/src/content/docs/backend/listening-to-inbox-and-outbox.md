---
title: Listening to inbox & outbox
sidebar:
  order: 3
---

To listen to a Pod's inbox and outbox, applications can use [Solid Notifications](../design/live-update.md#solid-notifications), and for backend-to-backend we recommend webhook subscriptions.

The mechanism for generating webhooks and subscribing to collections can be tedious, so fortunately we provide services and mixins that make this much easier.

## `PodActivitiesWatcherService`

This service, which is automatically created by the `AppService`, will check for all users who have granted the special `apods:ReadInbox' and `apods:ReadOutbox' permissions, and will automatically subscribe to webhooks.

Each service can monitor certain types of activity like this:

```js
await ctx.call('pod-activities-watcher.watch', {
  matcher: {
    type: 'Invite',
    object: {
      type: 'Event'
    }
  },
  actionName: 'my-service.my-action',
  boxTypes: ['inbox', 'outbox'],
  key: 'invite-event'
});
```

In the above example, whenever an activity matching the `Invite > Event` pattern is detected in either the user's inbox or outbox, the `my-service.my-action` action is called.

This action receives as parameters `key` (the custom key passed above), `boxType` ("inbox" or "outbox"), `dereferencedActivity` (the activity dereferenced according to the provided pattern), and `actorUri` (the URI of the actor who owns the inbox or outbox).

## `PodActivitiesHandlerMixin`

To make things even simpler, we also provide a `PodActivitiesHandlerMixin` that can be integrated into any service.

It works on the same principle as SemApps' [ActivitiesHandlerMixin](https://semapps.org/docs/middleware/activitypub/activities-handler), except that it will use the `PodActivitiesWatcherService` to subscribe to the user's inbox/outbox and listen for activities.

```js
const { PodActivitiesHandlerMixin } = require('@activitypods/app');

module.exports = {
  name: 'invite',
  mixins: [PodActivitiesHandlerMixin],
  activities: {
    invite: {
      match: {
        type: 'Invite',
        object: {
          type: 'Event'
        }
      },
      async onEmit(ctx, activity, actorUri) {
        console.log(`You sent an invitation to ${activity.object.name}!`);
      },
      async onReceive(ctx, activity, actorUri) {
        console.log(`You have been invited to ${activity.object.name}!`);
      }
    }
  }
};
```
