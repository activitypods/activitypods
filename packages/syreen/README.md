# Profile Service

An [ActivityPods](../../README.md) service to handle [app.syreen.fr](https://app.syreen.fr) data.

## Services

- [OfferService](services/offer.js)
- [ProjectService](services/project.js)

## Containers

- `/syreen/offers` with the offers
- `/syreen/projects` with the projects containing the offers

## Ontology

As [recommended by the Solid project](https://github.com/solid/vocab#recommended-by-solid), the [vCard ontology](https://www.w3.org/TR/vcard-rdf/) is used to describe individuals and locations.
