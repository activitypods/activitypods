# Events App

An [ActivityPods](../../README.md) app to handle events, with invitation and registration.

## Services

- [EventService](services/event.js)
- [InvitationService](services/invitation.js)
- [RegistrationService](services/registration.js)
- [StatusService](services/status.js)

## Dependencies

- [Core](../core/README.md)
- [Synchronizer](../synchronizer/README.md)

## Containers

- `/events` with the events created by the user or to whom he has been invited

## Collections

Attached to all events:

- `/invitees` with the list of actors who have been invited to the event
- `/inviters` with the list of actors who are allowed to invite to the event
- `/attendees` with the list of actors who are attending the event (including the organizer)

## Ontology

- The [ActivityStreams](https://www.w3.org/TR/activitystreams-core/) ontology should be used to describe the events.
- The [Dublin Core Metadata](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/#http://purl.org/dc/elements/1.1/creator) ontology's `creator` predicate is used to find who is the creator of the event.

## Handled activities

### Invite to event

```json
{
  "type": "Invite",
  "object": {
    "type": "Event"
  }
}
```

#### Emitter's side effects

- The recipients are added to the `/invitees` collection.
- The recipients are added to a WebACL group which can view the event.

#### Recipients' side effects

- The event is cached in the recipients' PODs
- Notifications are sent to the recipients


### Offer to invite to event

```json
{
  "type": "Offer",
  "object": {
    "type": "Invite",
    "object": {
      "type": "Event"
    }
  }
}
```

#### Emitter's side effects

- If the offer is sent by the event organizer, it means he wants to give invitees the right to share this event
  - The recipients are added to the `/inviters` collection.
  - The recipients are added to a WebACL group which can view the other invitees.

#### Recipients' side effects

- If the offer is sent to the organizer, it means we are an inviter and want him to invite one of our contacts
  - The organizer sends an invitation to the actor specified by the inviter
  - The inviter is informed his invitation has been accepted (via an Accept activity)


### Join event

```json
{
  "type": "Join",
  "object": {
    "type": "Event"
  }
}
```

#### Emitter's side effects

- None

#### Recipients' side effects

- The recipients are added to the `/attendees` collection
- A notification is sent to the organizer


### Leave event

```json
{
  "type": "Leave",
  "object": {
    "type": "Event"
  }
}
```

#### Emitter's side effects

- None

#### Recipients' side effects

- The recipients are removed from the `/attendees` collection
- A notification is sent to the organizer
