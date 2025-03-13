---
title: Resources management
sidebar:
  order: 5
---

## Linked Data Platform

Each Solid Pod must comply with the [Linked Data Platform](https://www.w3.org/TR/ldp/) protocol. This is a REST-based API for managing containers and resources.

### Formats

We support mainly the JSON-LD format. Turtle support is very weak, but will fixed in 2025.

### Containers

We support the [`BasicContainer`](https://www.w3.org/TR/ldp/#ldpc-container) type, as required by the [Solid specs](https://solid.github.io/specification/protocol#resource-containment).

### Binaries

We support non-RDF resources (binaries) uploads. The description of the resource is stored in the triplestore as a `http://semapps.org/ns/core#File`.

```turtle
<https://mypod.store/alice/data/files/picture.jpg>
   a <http://semapps.org/ns/core#File> ;
   <http://semapps.org/ns/core#fileName> "picture.jpg" ;
   <http://semapps.org/ns/core#localPath> "uploads/files/picture.jpg" ;
   <http://semapps.org/ns/core#mimeType> "image/jpeg" .
```

There is an [issue](https://github.com/assemblee-virtuelle/semapps/issues/1192) to use the Solid recommended metadata instead.

### PATCH method

LDP resources and containers can be selectively modified using the HTTP `PATCH` method. This method is important because it limits the risk of overwriting data, as with the simpler `PUT` method.

Initially, the recommended method for Solid servers was [SparqlPatch](http://www.w3.org/2001/sw/wiki/SparqlPatch) and this is what we implemented. In [2021](https://github.com/solid/specification/issues/332), it was switched to a new N3 Patch method, as described in the [Solid spec](https://solid.github.io/specification/protocol#writing-resources).

We plan to support N3 Patch in 2025.

##### SparqlPatch update to modify a LDP resource.

```
PATCH /alice HTTP/1.1
Host: mypod.store
Content-Type: application/sparql-update

PREFIX as: <https://www.w3.org/ns/activitystreams#>
INSERT DATA { <https://mypod.store/alice> as:preferredUsername "Alice" . };
DELETE DATA { <https://mypod.store/alice> as:preferredUsername "ALICE" . };
```

##### SparqlPatch update to add or remove a resource from a LDP container.

```
PATCH /alice/data/events HTTP/1.1
Host: mypod.store
Content-Type: application/sparql-update

PREFIX ldp: <http://www.w3.org/ns/ldp#>
INSERT DATA { <http://mypod.store/alice/data/events> ldp:contains <http://url/of/resource/to/attach>. };
DELETE DATA { <http://mypod.store/alice/data/events> ldp:contains <http://url/of/resource/to/detach>. };
```

#### LDP Prefer header

👷 To be implemented. ([#1168](https://github.com/assemblee-virtuelle/semapps/issues/1168))

#### LDP paging

👷 To be implemented. ([#176](https://github.com/assemblee-virtuelle/semapps/issues/176))

## Collections

In ActivityPub, [ActivityStreams collections](https://www.w3.org/TR/activitystreams-core/#collections) are frequently used to handle side-effects. For example, when a `Follow` activity is sent, the actor is added to the `as:followers` collection.

Collections have their own paging system. They can be ordered or unordered. Also, they can dereference the items they contain (this is the case for the inbox) or only display their URIs (like the `as:followers` collection).

### Create custom collection

In SemApps, ActivityStreams collections can be POSTed as regular LDP resources. The target container should be `/as/collection`.

The `@type` can be a `as:Collection` or a `as:OrderedCollection`, depending on weither you need items to be ordered or not.

In the case of a `as:OrderedCollection`, you must also indicate the `semapps:sortPredicate` and `semapps:sortOrder`.

We have added a `semapps:dereferenceItems` in order to declare if the items should be dereferenced or not, and `semapps:itemsPerPage` to activate pagination.

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "semapps": "http://semapps.org/ns/core#"
    }
  ],
  "@type": "OrderedCollection",
  "semapps:sortPredicate": "as:published",
  "semapps:sortOrder": "semapps:DescOrder", // or "semapps:AscOrder"
  "semapps:dereferenceItems": false,
  "semapps:itemsPerPage": undefined // No pagination per default
}
```

There are [discussions in the fediverse](https://socialhub.activitypub.rocks/t/fep-5bf0-collection-sorting-and-filtering/3095) to specify these missing predicates.

### Add or remove items

It's possible to add items to (or remove items from) a collection using the [SparqlPatch](solid.mdx#patch-method) method, the `application/sparql-update` Content-Type and a SPARQL query like this on the body:

```sparql
PREFIX as: <https://www.w3.org/ns/activitystreams#>
INSERT DATA {
  <https://mypod.store/alice/followers> as:items <https://mypod.store/bob> .
};
DELETE DATA {
  <https://mypod.store/alice/followers> as:items <https://mypod.store/craig> .
}
```

## SPARQL endpoint

Even though it is not required anymore by the Solid spec, every Pod comes with an SPARQL endpoint, linked to the WebID with the `void:sparqlEndpoint` predicate.

Only SPARQL _queries_ are supported, not [SPARQL _updates_](https://www.w3.org/TR/sparql11-update/) (You MUST use LDP or ActivityPub to modify data).
WAC permissions are applied to all SPARQL queries, in order to return only the resources that the autenticated user or application has the right to see.

:::note
Since this permission check decreases performances and tie us to a triple store (currently Jena Fuseki), we may considering removing SPARQL support in the future.
:::
