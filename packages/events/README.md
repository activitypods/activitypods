# Events App

An [ActivityPods](../../README.md) app to handle events.

## Services

- [AttendeesMatcherService](services/attendees-matcher.js)
- [EventService](services/event.js)
- [LocationService](services/location.js)
- [MessageService](services/message.js)
- [RegistrationService](services/registration.js)
- [StatusService](services/status.js)

## Dependencies

- [Core](../core/README.md)

## Containers

- `/events` with the events created by the user or to whom he has been invited

## Collections

Attached to all events:

- `/announces` with the list of actors who have been invited to the event
- `/announcers` with the list of actors who are allowed to invite to the event
- `/attendees` with the list of actors who are attending the event (including the organizer)

## Ontology

- The [ActivityStreams](https://www.w3.org/TR/activitystreams-core/) ontology should be used to describe the events.
- The [Dublin Core Metadata](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/#http://purl.org/dc/elements/1.1/creator) ontology's `creator` predicate is used to find who is the creator of the event.

## Handled activities

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
