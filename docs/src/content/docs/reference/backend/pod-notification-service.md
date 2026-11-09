---
title: PodNotificationService
---

This service, automatically created by the AppService with the key `pod-notification`, allows you to easily send notifications to the Pod owner. See [this page](/app-framework/backend/sending-notifications) for usage examples.

## Actions

The following service actions are available.

### `send`

Transform and translate a given template, and send it to the recipient as a notification.

#### Parameters

| Property       | Type     | Description                                                    |
| -------------- | -------- | -------------------------------------------------------------- |
| `template`     | `Object` | Template to be transformed and translated (see below)          |
| `recipientUri` | `URI`    | Recipient of the notification                                  |
| `activity`     | `Object` | Activity which triggered the notification, if any              |
| `context`      | `URI`    | Context of the notification (by default, the activity URI). If |

Any other parameter will be passed to the template compilation.

## Template format

The template is compiled with [HandlebarsJS](https://handlebarsjs.com/). It must include a title, a content and one or more actions. Every string can be internationalized: the language of the Pod owner will be used.

```js
{
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
  }
```

The template receive several variables:

- `activity`: the activity provided in the `send` action
- `emitter`: the emitter (based on `activity.actor` property)
- `emitterProfile`: the emitter's profile, if it exists (based on `emitter.url` property)
- Any other data that you pass to the `send` action

In addition to HandlebarsJS' [built-in helpers](https://handlebarsjs.com/guide/builtin-helpers.html#if), we provide the following helpers:

- `encodeUri`: Call the [encodeURIComponent](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent) function
