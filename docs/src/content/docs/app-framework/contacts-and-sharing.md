---
title: Contacts and sharing
---

Contacts and resources sharing are handled by the Pod provider, so that they work the same way across all applications. Your application only needs to read the contacts, and to post the right activities.

## Contacts

### Where are contacts stored ?

The contacts of a user are listed in the `apods:contacts` collection, attached to their WebID. When a contact is added, their profile is also cached in the user's Pod, in the same container as the user's own profile. Contacts can be grouped by the user in `vcard:Group` resources, which are managed through the Pod provider frontend.

To display the user's contacts, request read access to the corresponding shape trees:

```js
accessNeeds: {
  required: [
    {
      shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/as/Profile',
      accessMode: 'acl:Read'
    },
    {
      shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/vcard/Group',
      accessMode: 'acl:Read'
    }
  ];
}
```

On the frontend, you can then list the profiles of the contacts like any other resource:

```js
export default dataProvider({
  resources: {
    contacts: {
      shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/as/Profile'
    },
    groups: {
      shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/vcard/Group'
    }
  }
  // ...
});
```

Each profile includes a `describes` property with the WebID of the contact. Note that the user's own profile is in the same container.

On the backend, you can get the WebIDs of the contacts with the [`PodCollectionsService`](/reference/pod-collections-service/):

```js
const { body: actor } = await ctx.call('pod-resources.get', { resourceUri: actorUri, actorUri });

const contactsUris = await ctx.call('pod-collections.getItems', {
  collectionUri: actor['apods:contacts'],
  actorUri
});
```

### Contact requests

Contact requests are made with the following activities:

| Activity                    | Effect                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `Offer` > `Add` > `Profile` | Sends a contact request, with the profile of the emitter. The recipient is notified by email. |
| `Accept` > `Offer`          | Both users are added to each other's contacts and can read each other's profile.              |
| `Reject` > `Offer`          | The request is rejected. Further requests from the same person will be rejected too.          |
| `Ignore` > `Offer`          | The request is removed, without notifying the emitter.                                        |
| `Remove` > `Person`         | Removes a contact. The `origin` must be the `apods:contacts` collection.                      |

The Pod provider frontend lets users send and answer contact requests. But if your application has the `apods:PostOutbox` special right, it can also send contact requests on behalf of the user. For example, after an event, [Welcome to my Place](https://welcometomyplace.org) suggests to the participants to connect with each other:

```js
await ctx.call('pod-outbox.post', {
  activity: {
    type: 'Offer',
    actor: aliceUri,
    object: {
      type: 'Add',
      object: aliceProfileUri
    },
    content: 'Following the event "Birthday party", you may add Alice to your network.',
    context: eventUri,
    target: bobUri,
    to: bobUri
  },
  actorUri: aliceUri
});
```

When a contact request with a `context` is accepted, the emitter is not notified.

### Contact links

Users can also create a contact link from the Pod provider frontend. Anyone who opens this link can see the user's profile and, after logging in with their own Pod, send a contact request which will be accepted automatically. This is based on a [capability](/architecture/authorization/#capabilities-with-verifiable-credentials) and doesn't require anything from applications.

## Sharing resources

### Sharing with an `Announce` activity

To share a resource with some actors, post an `Announce` activity to the outbox of the creator of the resource:

```js
const outbox = useOutbox();

outbox.post({
  type: 'Announce',
  actor: outbox.owner,
  object: resourceUri,
  to: [bobUri, craigUri]
});
```

When the Pod provider receives this activity, it:

- Gives the recipients read access to the resource, as well as to the profile of its creator.
- Adds them to the `apods:announces` collection, which is attached to the resource. You can use it to display the list of persons with whom the resource has been shared.
- Stores a copy of the resource in the recipients' Pods, in the container of its type. So if Bob uses the same application, the shared events will appear in his events list, along with his own events.
- Gives [delegated access grants](/key-concepts/#sharing-resources) to the applications of the recipients, so that they can read the original resource.

When the resource is updated or deleted, an `Update` or `Delete` activity is sent to all the recipients, so that their copy is kept up to date.

:::note
Public `Announce` activities (sent to `as:Public`) are not handled.
:::

### Allowing recipients to share the resource

The creator of the resource can allow the recipients to share it with their own contacts:

```js
outbox.post({
  type: 'Announce',
  actor: outbox.owner,
  object: resourceUri,
  to: bobUri,
  'interop:delegationAllowed': true,
  'interop:delegationLimit': 1
});
```

The recipients are then added to the `apods:announcers` collection, and they can post `Announce` activities for this resource from their own outbox. Only the creator of a resource can allow delegation.

### Share buttons

The `@activitypods/react` package provides two components that you can include in the `actions` of a React-Admin `Show` view.

The `ShareButton` opens a dialog listing the contacts and contact groups of the user. For each contact, the user can choose whether they can view or share the resource. The button is hidden if the user cannot read the `apods:announces` collection, in other words if they are neither the creator nor an announcer.

```jsx
import { ShareButton } from '@activitypods/react';

const EventShowActions = () => <ShareButton profileResource="contacts" groupResource="groups" />;
```

The `profileResource` and `groupResource` props are the names of the data provider resources for the profiles and contact groups (see above).

The `RemoteShareButton` redirects the user to the Pod provider, where they can choose with whom to share the resource. This way, your application doesn't need to have access to the user's contacts. It is only displayed to the creator of the resource.

```jsx
import { RemoteShareButton } from '@activitypods/react';

const EventShowActions = () => <RemoteShareButton clientId="https://example.app/app" />;
```

### Reacting to shared resources

Since shared resources are stored in the recipients' containers, your application can tell them apart from the user's own resources by looking at the `dc:creator` property.

To react when a resource is shared, for example to notify the recipients, use the [`PodActivitiesHandlerMixin`](/app-framework/backend/listening-to-inbox-and-outbox/#services-dedicated-to-handling-activities). This requires the `apods:ReadOutbox` special right.

```js
const { PodActivitiesHandlerMixin } = require('@activitypods/app');

module.exports = {
  name: 'invitation',
  mixins: [PodActivitiesHandlerMixin],
  activities: {
    invite: {
      match: {
        type: 'Announce',
        object: {
          type: 'Event'
        }
      },
      async onEmit(ctx, activity) {
        for (const recipientUri of [].concat(activity.to)) {
          await ctx.call('pod-notifications.send', {
            template: {
              title: {
                en: `{{{emitterProfile.vcard:given-name}}} invites you to an event "{{{activity.object.name}}}"`
              }
            },
            activity,
            context: activity.object.id,
            recipientUri
          });
        }
      }
    }
  }
};
```

The notification is sent to the recipients directly, so that they receive it even if they haven't installed the application yet. See [Sending notifications](/app-framework/backend/sending-notifications/).

### Limitations

- There is currently no way to stop sharing a resource.
- Collections attached to a resource after it has been shared, such as `replies` or `likes`, are not added to the copies stored in the recipients' Pods. Their URIs are predictable (`<resourceUri>/replies`, `<resourceUri>/likes`), so you can compute them instead of reading them from the copy.
