---
title: Resources management
sidebar:
  order: 5
---

Each Solid Pod must comply with the [Linked Data Platform](https://www.w3.org/TR/ldp/) protocol. This is a REST-based API for managing containers and resources.

## Formats

We support both JSON-LD and Turtle format.

## Containers

We support the [`BasicContainer`](https://www.w3.org/TR/ldp/#ldpc-container) type, as required by the [Solid specs](https://solid.github.io/specification/protocol#resource-containment).

## Binaries

We support non-RDF resources (binaries) uploads. The description of the resource is stored in the triplestore as a `http://semapps.org/ns/core#File`.

```turtle
<https://mypod.store/alice/data/files/picture.jpg>
   a <http://semapps.org/ns/core#File> ;
   <http://semapps.org/ns/core#fileName> "picture.jpg" ;
   <http://semapps.org/ns/core#localPath> "uploads/files/picture.jpg" ;
   <http://semapps.org/ns/core#mimeType> "image/jpeg" .
```

There is an [issue](https://github.com/assemblee-virtuelle/semapps/issues/1192) to use the Solid recommended metadata instead.

## PATCH method

LDP resources and containers can be selectively modified using the HTTP `PATCH` method. This method is important because it limits the risk of overwriting data, as with the simpler `PUT` method.
However, due to the way RDF resources are formatted, the `PATCH` method cannot be used like more regular REST-based APIs.
Many solutions have been proposed in the semantic web community to solve this problem:

- [LD Patch](https://www.w3.org/TR/ldpatch/)
- [SPARQL 1.1 Update](http://www.w3.org/TR/sparql11-http-rdf-update/#http-patch)
- [SparqlPatch](http://www.w3.org/2001/sw/wiki/SparqlPatch)
- [TurtlePatch](http://www.w3.org/2001/sw/wiki/TurtlePatch)
- [RDF Patch](http://afs.github.io/rdf-patch/)

Initially, the recommended method for Solid servers was [SparqlPatch](http://www.w3.org/2001/sw/wiki/SparqlPatch) and this is what we implemented. In [2021](https://github.com/solid/specification/issues/332), it was switched to a new N3 Patch method, as described in the [Solid spec](https://solid.github.io/specification/protocol#writing-resources). It is not yet a W3C standard.

Until the N3 Patch method is standardized, we will continue to use the [SparqlPatch](http://www.w3.org/2001/sw/wiki/SparqlPatch) format.

##### SparqlPatch update to modify a LDP resource.

```
PATCH /alice HTTP/1.1
Host: mypod.store
Content-Type: application/sparql-update

PREFIX as: <https://www.w3.org/ns/activitystreams#>
INSERT DATA { <https://mypod.store/alice> as:preferredUsername "Alice" . };
DELETE DATA { <https://mypod.store/alice> as:preferredUsername "ALICE" . };
```

#### SparqlPatch update to add or remove a resource from a LDP container.

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

## SPARQL endpoint

Even though it is not required anymore by the Solid spec, every Pod comes with an SPARQL endpoint, linked to the WebID with the `void:sparqlEndpoint` predicate.
Only SPARQL _queries_ are supported, not [SPARQL _updates_](https://www.w3.org/TR/sparql11-update/) (You MUST use LDP or ActivityPub to modify data).
WAC permissions are applied to all SPARQL queries, in order to return only the resources that the autenticated user or application has the right to see.
