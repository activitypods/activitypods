# Announcer Service

An [ActivityPods](../../README.md) service to announce (share) objects, and give the right to other users to announce.


## Usage

The `AnnouncerService` is included in the [`CoreService`](../core). The easiest way to make use of it is to import the `AnnouncerMixin` along with the `ControlledContainerMixin`.

```js
const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin } = require('@activitypods/announcer');

module.exports = {
  name: 'events',
  mixins: [AnnouncerMixin, ControlledContainerMixin], // In that order
  settings: {
    path: '/events',
    acceptedTypes: ['Event'],
    // If you wish to customize the notification sent when an object is announced, you can change any of the properties below
    notificationMapping: {
      key: 'announce',
      title: {
        en: `{{emitterProfile.vcard:given-name}} shared with you "{{activity.object.name}}"`,
        fr: `{{emitterProfile.vcard:given-name}} a partagé avec vous "{{activity.object.name}}"`
      },
      actionName: {
        en: 'View',
        fr: 'Voir'
      },
      actionLink: "/e/{{encodeUri activity.object.id}}"
    }
  }
}
```


## Actions

### `watch`

Watch a new type of object. If the `acceptedTypes` setting is set, it will call the `watch` actions at the start of the service.

##### Parameters
| Property | Type                | Default      | Description                           |
|----------|---------------------|--------------|---------------------------------------|
| `type`   | `String` or `Array` | **required** | The type of resource we want to watch |


## Handled activities

### Announce an object

```json
{
  "type": "Announce",
  "object": {
    "type": "[WATCHED TYPES]"
  }
}
```

#### Emitter's side effects

- The recipients are added to the `/announces` collection.
- The recipients are added to a WebACL group which is allowed to view (`acl:Read`) the object.

#### Recipients' side effects

- The object is cached in the recipients' PODs
- Notifications are sent to the recipients (see `notificationMapping` setting above)


### Offer to announce an object

```json
{
  "type": "Offer",
  "object": {
    "type": "Announce",
    "object": {
      "type": "[WATCHED TYPES]"
    }
  }
}
```

#### Emitter's side effects

- If the activity is sent **by** the object creator, it means he wants to give the right to share this object
    - The recipients are added to the `/announcers` collection.
    - The recipients are added to a WebACL group which can view the `/announces` collection.

#### Recipients' side effects

- If the activity is sent **to** the object creator, it means we are an announcer and want the creator to announce the object to one of our contacts
    - The object creator sends an `Announce` activity to the actor specified by the announcer
    - The announcer is informed that his offer has been accepted (via an `Accept` activity)
