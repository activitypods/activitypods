---
title: Sending notifications
sidebar:
  order: 7
---

Notifications are an important part of social applications. If you have no way to help the users remind of the application, there are great chances that they will forget about them ! So, contrary to Solid Pod, we include a simple way to send notifications.

For now, notifications are automatically translated to emails. In the future, we will support web push notifications. We may also display all notifications in a feed on the Pod provider frontend. The user will be able to choose how he want to receive notifications depending on applications. But all this will be managed by the Pod provider so you don't need to worry about this.

## Message format

**Added in:** `activitypods@2.0`

Apps can send notifications to Pod users like this:

```json
{
  "type": ["Note", "apods:Notification"],
  "actor": "https://welcometomyplace.org/data/app",
  "name": "Alice invites you to an event: my birthday party !",
  "content": "I'm very happy to invite you to my world-famous birthday party !",
  "url": [
    {
      "type": "Link",
      "name": "View",
      "href": "https://welcometomyplace.org/Event/{eventUri}/show"
    },
    {
      "type": "Link",
      "name": "Ignore future Alice invitations",
      "href": "https://welcometomyplace.org/Event/{eventUri}/show?action=ignore"
    }
  ],
  "context": "https://mypod.store/alice/data/{uuid}"
}
```

They will be transformed into emails and, in the future, push notifications.

The `context` will be an important way to avoid multiple applications to send notifications for the same activity.

Applications can find the preferred language of an user by looking at the `schema:knowsLanguage` predicate on its WebID.

## Using the `PodNotificationsService`

To make it easier to send notifications, you can use the `PodNotificationsService`.

```js
await ctx.call('pod-notifications.send', {
  template: {
    title: {
      en: `{{emitterProfile.vcard:given-name}} invites you to an event "{{activity.object.name}}"`,
      fr: `{{emitterProfile.vcard:given-name}} vous invite à une rencontre "{{activity.object.name}}"`
    },
    content: '{{activity.object.content}}',
    actions: [
      {
        caption: {
          en: 'View',
          fr: 'Voir'
        },
        link: '/Event/{{encodeUri activity.object.id}}/show'
      }
    ]
  },
  activity,
  context: activity.object.id,
  recipientUri: actorUri
});
```

This service will automatically translate strings on the language defined by the user, using [Handlebars](https://handlebarsjs.com). It will be passed the following parameters:

- `activity`: the activity that you provided
- `emitter`: the WebID of the user sending the activity
- `emitterProfile`: the profile of the user sending the activity (if available)
- Any other parameters that you pass to the `send` action.

Furthermore, all relative links will be based on the frontend URL of your application. You can use the `encodeUri` helper to encode URLs (see the example above)
