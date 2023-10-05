---
layout: ~/layouts/MdLayout.astro
title: ActivityPods specificity
---

We try to make these standards.

### SPARQL endpoint respecting WAC permissions

Every Pod comes with an SPARQL endpoint, linked to the WebID with the `void:sparqlEndpoint` predicate. Only SPARQL _queries_ are supported, not [SPARQL _updates_](https://www.w3.org/TR/sparql11-update/) (You MUST use LDP or ActivityPub to modify data)

### Proxy endpoint with non-GET methods

We have extended the [ActivityPub proxy endpoint](./activitypub#proxy-endpoint) to support HTTP methods others than GET.

To do that, you may pass a [`multipart/form-data``](https://developer.mozilla.org/en-US/docs/Web/API/FormData/Using_FormData_Objects) Content-Type with the following fields:

- `id`: The URI of the resource
- `method`: The HTTP method to use (default to `GET`)
- `headers`: The HTTP headers to pass to the request (in JSON format)
- `body`: The body of the request (optional)

### Apps registration through ActivityPub

### Announces / Announcers collections

### Collection API

> TODO: https://github.com/assemblee-virtuelle/semapps/issues/1165

It's possible to add items to (or remove items from) a collection using the `PATCH` method, the `application/sparql-update` Content-Type and a SPARQL query like this on the body:

```sparql
PREFIX as: <https://www.w3.org/ns/activitystreams#>
INSERT DATA {
  <https://mypod.store/alice/followers> as:items <https://mypod.store/bob> .
};
DELETE DATA {
  <https://mypod.store/alice/followers> as:items <https://mypod.store/craig> .
}
```

### Custom collections

It's possible to create other kinds of collections.

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
