---
title: Application interoperability
sidebar:
  order: 1
---

## Solid Application Interoperability

**Added in:** `activitypods@2.0`

[Solid Application Interoperability](https://solid.github.io/data-interoperability-panel/specification) is a complex specification which is not yet complete.
We've implemented everything we can at the moment and are waiting to see how it evolves before implementing the remaining parts.

We're following the proposed ontology closely. On the other hand, application registration is done via ActivityPub, as this was the simplest method for us (applications are ActivityPub actors).
We've also decided not to use [ShapeTrees](https://shapetrees.org) for the time being, as we don't think they add anything to our triplestore-based architecture: instead, applications just declare the classes they want to manage.

### What we implement

- Applications declare their needs through `AccessNeedGroups` and `AccessNeeds`, which are displayed on an authorization screen.
- Before registration, `AccessGrants` and `DataGrants` are created on the user's Pod.
- The `ApplicationRegistration` resource is created on the user's Pod and sent to the application through a `Create` activity.
- If the `ApplicationRegistration` is correct, it is saved on the application instance, as well as the corresponding grants. It returns an `Accept` activity.
- Whenever the user connects again to the application, we check that the `AccessNeeds` haven't changed. If needed, we show an authorization screen again and `ApplicationRegistration` is updated (with a `Update` activity).
- If the user wants to uninstall the application, we delete the `ApplicationRegistration` (and corresponding grants)
  and send a `Delete` activity to the application.

### What we don't implement yet

- Authorization flow is handled using ActivityPub. The application is an ActivityPub actor.
- We only handle registration with `Applications`, not with other `SocialAgents` (we continue to use WAC permissions for the latter)
- Pods don't declare an `AuthorizationAgent`. It is handled internally.
- Pods don't declare a `DataRegistry`. This registry is only used to list ShapeTrees. TypeIndex can be used instead.
- Applications don't declare `AccessNeedDescription`. On the other hand, in the `AccessDescriptionSet` it is possible to declare [`ClassDescriptions`](#class-descriptions).
- Pods only create `AccessGrants` and `DataGrants`, not `AccessAuthorizations` and `DataAuthorizations`. Grants can be shared with the registered application, while Authorizations cannot. The only difference between them is a `grantedWith` predicate in `AccessAuthorizations` that indicates which app was used to manage authorizations (but we manage that internally anyway).
- Pods don't declare `RegistrySet`, `ApplicationRegistry`, `AuthorizationRegistry` as they are not visible from the outside. We just read `ApplicationRegistrations`, `AccessGrants` and `DataGrants` in their dedicated containers.

## Type Indexes

**Added in:** `activitypods@2.0`

We have implemented a basic [TypeIndex](https://github.com/solid/type-indexes), that is linked to the WebID with the `solid:publicTypeIndex` predicate.

Since we don't support yet RDF documents (planned for version 3.0), we use a custom `solid:hasTypeRegistration` predicate to link the `solid:TypeIndex` with the various `solid:TypeRegistration`, and we dereference them for easier handling. See [this issue](https://github.com/solid/type-indexes/issues/29) for more details.

```
{
   "id":"https://mypod.store/sro/data/9abafd71-39d9-47f2-8a1d-a50cb6a0a5c6",
   "type":[ "solid:TypeIndex", "solid:ListedDocument"],
   "solid:hasTypeRegistration":[
      {
         "id":"https://mypod.store/sro/data/da9c1935-1c9d-4660-81de-183657c2a7a7",
         "type":"solid:TypeRegistration",
         "dc:created":"2024-07-02T15:41:41.252Z",
         "dc:creator":"https://mypod.store/sro",
         "dc:modified":"2024-07-02T15:41:41.252Z",
         "solid:forClass":"vcard:Group",
         "solid:instanceContainer":"https://mypod.store/sro/data/vcard/group"
      },
      ...
   ]
}
```

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
  "apods:openEndpoint": "https://welcometomyplace.org/r"
}
```

- `skos:prefLabel` is the
- `apods:labelPredicate` indicates the predicate to be used to obtain the resource label. This displays the resource label in the data browser.
- `apods:openEndpoint` is the URL

Class descriptions are located in the `interop:AccessDescriptionSet`

```json
{
  "@type": "interop:AccessDescriptionSet",
  "interop:usesLanguage": "en",
  "apods:hasClassDescription": "https://mypod.store/alice/data/eba0227a-3bbb-4582-b879
}
```
