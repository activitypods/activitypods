# Contacts App

An [ActivityPods](../../README.md) application to handle contacts exchange and management

## Services

- [ManagerService](services/manager.js)
- [RequestService](services/request.js)

## Dependencies

- [CoreService](../core/README.md)
- [ProfileService](../profiles/README.md)

## Collections

Attached to the actor:

- `/contacts` with the list of actors whose contact has been accepted
- `/contact-requests` with the list of contact requests activities received
- `/rejected-contacts` with the list of actors whose contact has been rejected

## Handled activities

### Contact request

```json
{
  "type": "Offer",
  "object": {
    "type": "Add",
    "object": {
      "type": "Profile"
    }
  }
}
```

#### Emitter's side effects

- The recipients are given read access to the emitter's profile

#### Recipients' side effects

- The activity is added to the recipient's `/contact-requests` collection.
- A notification is sent to the recipient


### Accept contact request

```json
{
  "type": "Accept",
  "object": {
    "type": "Offer",
    "object": {
      "type": "Add",
      "object": {
        "type": "Profile"
      }
    }
  }
}
```

#### Emitter's side effects

- The recipients are given read access to the emitter's profile
- The recipients' profiles are cached in the emitter's POD
- The recipients are attached to the emitter's `/contacts` collection
- The contact request activity is removed from the emitter's `/contact-requests` collection.

#### Recipients' side effects

- The emitter profile is cached in the recipients' PODs
- The emitter is attached to the recipients' `/contacts` collection


### Ignore contact request

```json
{
  "type": "Ignore",
  "object": {
    "type": "Offer",
    "object": {
      "type": "Add",
      "object": {
        "type": "Profile"
      }
    }
  }
}
```

#### Emitter's side effects

- The contact request activity is removed from the emitter's `/contact-requests` collection.

#### Recipients' side effects

- The emitter lose read access to the recipient's profile


### Reject contact request

```json
{
  "type": "Reject",
  "object": {
    "type": "Offer",
    "object": {
      "type": "Add",
      "object": {
        "type": "Profile"
      }
    }
  }
}
```

#### Emitter's side effects

- The recipients are attached to the emitter's `/rejected-contacts` collection (new contact requests will be automatically rejected)
- The contact request activity is removed from the emitter's `/contact-requests` collection.

#### Recipients' side effects

- The emitter lose read access to the recipient's profile


### Ignore contact

```json
{
  "type": "Ignore",
  "object": {
    "type": "Person"
  }
}
```

#### Emitter's side effects

- The recipients are attached to the emitter's private `/ignored-contacts` collection. Notifications, except for direct messages (`Note`), are from thereon suppressed.

#### Recipients' side effects

*none*

### Undo ignore contact

```json
{
  "type": "Undo",
  "object": {
    "type": "Ignore",
    "object": {
      "type": "Person"
    }
  }
}
```

#### Emitter's side effects

- The referenced person is removed from the `ignored-contacts` collection.

#### Recipients' side effects

*none*
