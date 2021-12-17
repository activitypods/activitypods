# Contacts App

An [ActivityPods](../../README.md) application to handle profile creation and contacts exchange

## Services

- [ProfileService](services/profile.js)
- [RequestService](services/request.js)
- [LocationService](services/location.js)

## Containers

- `/profiles` with the profile of the user and his contacts (`vcard:Individual`, `as:Profile`)
- `/locations` with the addresses linked to the user (`vcard:Location`)

## Collections

Attached to the actor:

- `/contacts` with the list of actors whose contact has been accepted
- `/contact-requests` with the list of contact requests activities received
- `/rejected-contacts` with the list of actors whose contact has been rejected

## Ontology

As [recommended by the Solid project](https://github.com/solid/vocab#recommended-by-solid), the [vCard ontology](https://www.w3.org/TR/vcard-rdf/) is used to describe individuals as well as locations.

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
