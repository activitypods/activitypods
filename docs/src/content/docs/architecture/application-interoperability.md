---
title: Application interoperability
sidebar:
  order: 1
---

## Solid Application Interoperability

**Added in:** `activitypods@2.0`

[Solid Application Interoperability](https://solid.github.io/data-interoperability-panel/specification) is a complex specification which is not yet complete.
We've implemented everything we could on ActivityPods 2.0 and we are currently working on implementing the remaining parts.

### What we don't implement yet

- We're not using [ShapeTrees](https://shapetrees.org) for the time being: instead, applications just declare the classes they want to manage (see below).
- We only handle registration with `Applications`, not with other `SocialAgents` (we continue to use WAC permissions for the latter)
- Pods don't declare a `DataRegistry`. TypeIndex can be used instead.
- Applications don't declare `AccessNeedDescription`. On the other hand, in the `AccessDescriptionSet` it is possible to declare [`ClassDescriptions`](#class-descriptions).
- Pods only create `AccessGrants` and `DataGrants`, not `AccessAuthorizations` and `DataAuthorizations`. Grants can be shared with the registered application, while Authorizations cannot.
- Pods don't declare `RegistrySet`, `ApplicationRegistry`, `AuthorizationRegistry`. We just read `ApplicationRegistrations`, `AccessGrants` and `DataGrants` in their dedicated containers.

## Class descriptions

**Added in:** `activitypods@2.0`

Applications can describe the types of resources (classes) they use. This enables user-friendly information to be displayed on the authorization screen, as well as on the data browser.

```json
{
  "@type": "apods:ClassDescription",
  "apods:describedClass": "https://www.w3.org/ns/activitystreams#Event",
  "apods:describedBy": "https://welcometomyplace.org",
  "skos:prefLabel": "Events",
  "apods:labelPredicate": "https://www.w3.org/ns/activitystreams#name",
  "apods:openEndpoint": "https://welcometomyplace.org/r",
  "apods:icon": "https://welcometomyplace.org/logo192.png"
}
```

The following predicates are used:

- `skos:prefLabel`: A human-readable label of the resource type
- `apods:labelPredicate`: The predicate used to label the resource
- `apods:openEndpoint`: An URL that can be used to open the resources
- `apods:icon`: An image to describe the resource type

Class descriptions are located in the `interop:AccessDescriptionSet`

```json
{
  "@type": "interop:AccessDescriptionSet",
  "interop:usesLanguage": "en",
  "apods:hasClassDescription": "https://mypod.store/alice/data/eba0227a-3bbb-4582-b879
}
```

## Type Indexes

**Added in:** `activitypods@2.0`

[TypeIndexes](https://github.com/solid/type-indexes) are Solid's recommended method to discover in what LDP containers the resources are being stored. In ActivityPods, we have implemented a public TypeIndex, that is linked to the WebID with the `solid:publicTypeIndex` predicate.

Since we don't support yet RDF documents (planned for version 3.0), we use a custom `solid:hasTypeRegistration` predicate to link the `solid:TypeIndex` with the various `solid:TypeRegistration`, and we dereference them for easier handling. See [this issue](https://github.com/solid/type-indexes/issues/29) for more details.

```
{
   "id":"https://mypod.store/sro/data/9abafd71-39d9-47f2-8a1d-a50cb6a0a5c6",
   "type":[ "solid:TypeIndex", "solid:ListedDocument"],
   "solid:hasTypeRegistration":[
      {
         "id":"https://mypod.store/sro/data/da9c1935-1c9d-4660-81de-183657c2a7a7",
         "type":"solid:TypeRegistration",
         "solid:forClass":"vcard:Group",
         "solid:instanceContainer":"https://mypod.store/sro/data/vcard/group"
      },
      ...
   ]
}
```

In addition to the `solid:forClass` and `solid:instanceContainer` predicates used by TypeRegistrations to indicate, respectively, the types and their container's URI, we are also persisting predicates that are used by the Pod provider's data browser. They are the same as the [ClassDescription](#class-description).

- `skos:prefLabel`: A human-readable label of the resource type
- `apods:labelPredicate`: The predicate used to label the resource
- `apods:openEndpoint`: An URL that can be used to open the resources
- `apods:icon`: An image to describe the resource type

Additionaly, two predicates are used in relation with apps registration:

- `apods:defaultApp`: The default app with which to open the resource type
- `apods:availableApps`: All the apps that are able to handle this resource type
