# Contacts App

An [ActivityPods](../../README.md) app to handle profile creation and contacts exchange

## Services

- [ProfileService](services/profile.js)
- [RequestService](services/request.js)

## Containers

- `/profiles` with the profile of the user and his contacts

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

- The recipients are attached to the emitter's `/rejected-contacts` collection
- The contact request activity is removed from the emitter's `/contact-requests` collection.

#### Recipients' side effects

- None
