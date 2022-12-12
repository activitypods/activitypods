# Profile Service

An [ActivityPods](../../README.md) service to manager user's profile and locations.

Automatically creates a `/data/profiles/me` profile on user registration.

## Services

- [ProfileService](services/profile.js)
- [EventService](services/location.js)

## Dependencies

- [SynchronizerService](../synchronizer/README.md)

## Containers

- `/profiles` with the profile of the user and his contacts (`vcard:Individual`, `as:Profile`)
- `/locations` with the addresses linked to the user (`vcard:Location`)

## Ontology

As [recommended by the Solid project](https://github.com/solid/vocab#recommended-by-solid), the [vCard ontology](https://www.w3.org/TR/vcard-rdf/) is used to describe individuals and locations.
