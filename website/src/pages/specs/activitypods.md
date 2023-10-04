---
layout: ~/layouts/MdLayout.astro
title: ActivityPods specificity
---

We try to make these standards.

### SPARQL endpoint respecting WAC permissions

Every Pod comes with an SPARQL endpoint, linked to the WebID with the `void:sparqlEndpoint` predicate. Only SPARQL queries are supported, not SPARQL updates (You MUST use LDP or ActivityPub to modify data)

### Proxy endpoint with non-GET methods

We have extended the ActivityPub proxy endpoint to support methods others than GET.

### Apps registration through ActivityPub

### Announces / Announcers collections

### Collection API

> TODO: https://github.com/assemblee-virtuelle/semapps/issues/1165

It's possible to add items to (or remove items from) a collection with SPARQL-patch.

### Custom collections

It's possible to create other kind of collection.

### Notifications

> TODO: https://github.com/assemblee-virtuelle/activitypods/issues/91

Apps can send notifications to Pod users like this:

```json
{
  "type": "Note",
  "actor": "https://welcometomyplace.org/data/app",
  "name": "Alice invites you to an event: my birthday party !",
  "content": "You have received an invitation from Alice",
  "url": [
    {
      "type": "Link",
      "name": "View",
      "href": "https://welcometomyplace.org/Event/{eventUri}/show"
    },
    {
      "type": "Link",
      "name": "Ignore future Alice invitations",
      "href": "https://welcometomyplace.org/Event/{eventUri}/show?action=ignore"
    }
  ],
  "context": "https://mypod.store/alice/data/{uuid}"
}
```

They are translated into emails and push notifications.

### JsonLD header
