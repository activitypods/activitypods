---
title: Application interoperability
sidebar:
  order: 1
---

## Solid Application Interoperability

**Updated in:** `activitypods@2.1`

[Solid Application Interoperability](https://solid.github.io/data-interoperability-panel/specification) (SAI) helps applications to be interoperable, while only giving them access to the resources they need.

We have fully implemented SAI for application registrations. We are in the process of implementing it also for user-to-user data sharing.

SAI introduces many new concepts, such as Shape Trees, Applications, Authorization Agents, Data Registrations, etc. We recommend to have a look at the [Application Primer](https://solid.github.io/data-interoperability-panel/primer/application.html): this will help understand some part of this documentation.

## Type Indexes

**Updated in:** `activitypods@2.1`

[TypeIndexes](https://github.com/solid/type-indexes) are Solid's recommended method to discover in what LDP containers the resources are being stored. In ActivityPods, we have implemented a public TypeIndexes, that are linked to the WebID with the `solid:publicTypeIndex` predicate, as well as private TypeIndexes that are linked with the user's Preference File.

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
