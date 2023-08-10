# Profile Service

An [ActivityPods](../../README.md) service to manager user's profile and locations.

Automatically creates a profile on user registration.

## Services

- [ProfileService](services/profile.js)
- [EventService](services/location.js)

## Containers

- `/profiles` with the profile of the user and his contacts (`vcard:Individual`, `as:Profile`)
- `/locations` with the addresses linked to the user (`vcard:Location`)
- `/groups` with the profiles of a user's contacts. The container will contain:
  - [vcard:Group](https://www.w3.org/TR/vcard-rdf/#d4e1667) subjects
  - [vcard:Group](https://www.w3.org/TR/vcard-rdf/#d4e1667) -> [vcard:hasMember](https://www.w3.org/TR/vcard-rdf/#d4e363) -> [vcard:Individual](https://www.w3.org/TR/vcard-rdf/#d4e1749) (located in the `/profiles` container) relationships
  - [vcard:label](https://www.w3.org/TR/vcard-rdf/#d4e1847)s for [vcard:Group](https://www.w3.org/TR/vcard-rdf/#d4e1667)s

## Ontology

As [recommended by the Solid project](https://github.com/solid/vocab#recommended-by-solid), the [vCard ontology](https://www.w3.org/TR/vcard-rdf/) is used to describe individuals and locations.
