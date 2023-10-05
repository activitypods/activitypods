---
layout: ~/layouts/MdLayout.astro
title: Solid conformance
---

Solid is a set of specifications.

### WebID

All ActivityPub actors are also WebIDs.

### Linked Data Protocol

We support the full protocol.

BasicContainer

SPARQL-patch

Turtle and Json-LD

### LDP paging

Not yet implemented.

TODO: https://github.com/assemblee-virtuelle/semapps/issues/176

### WAC permissions

We support the full [WAC specification](https://solid.github.io/web-access-control-spec/)

### ACP

Not supported.

### Type Index

Not yet implemented.

### Solid OIDC

Currently, we only support [HTTP signature](./activitypub#http-signature-authentication) for authentication on remote servers. Thanks to the [Proxy endpoint](activitypods.md#proxy-endpoint-with-non-get-methods), it solves all authentication needs we have.

We hope one day to support Solid OIDC so that Solid clients may connect to our Pods.

### Interoperability

[Solid Application Interoperability](https://solid.github.io/data-interoperability-panel/specification) is a complex specification which is not yet finished. Since we don't use [Solid-OIDC](#solid-oidc), we use ActivityPub and a new `Register` activity for app registration (applications are regular ActivityPub actors). We have also decided not to use ShapeTrees, which add nothing to our architecture: instead, applications only declare the classes they want to manage. For the rest, we chose to implement only the parts of the spec that we needed.

What we implement:

- Applications declare their needs through `AccessNeedGroups` and `AccessNeeds`, which are displayed on a user-readable screen.
- Before registration, `AccessGrants` and `DataGrants` are created on the user's Pod, and sent along with the `Register` activity.
- When the user receives an `Accept` activity for the registration, an `ApplicationRegistration` is saved on the user's Pod.
- Whenever the user connects again to the application, we check that the `AccessNeeds` haven't changed. If needed, we show an authorization screen again and `AccessGrants` are updated.

What we don't implement:

- Authorization flow is handled using ActivityPub, with a simple `Register` activity and not with Solid (yet).
- We only handle registration with `Applications`, not with other `SocialAgents` (we continue to use WAC permissions for the latter)
- Pods don't declare an `AuthorizationAgent`. It is handled internally.
- Pods don't declare a `DataRegistry` (This registry is only used to list ShapeTrees. TypeIndex can be used instead)
- Applications don't declare `AccessDescription` for the time being (we can deduce the accesses requested, and later it may be used to justify access to certain resources).
- Pods only create `AccessGrants` and `DataGrants`, not `AccessAuthorizations` and `DataAuthorizations`. Grants can be shared with the registered application, while Authorizations cannot. The only difference between them is a `grantedWith` predicate in `AccessAuthorizations` that indicates which app was used to manage authorizations (but we'll manage that internally anyway...).
- Pods don't declare `RegistrySet`, `ApplicationRegistry`, `AuthorizationRegistry` as they are not visible from the outside. We just read `ApplicationRegistrations`, `AccessGrants` and `DataGrants` in their dedicated containers.

### ShEx / SHACL

### ShapeTrees

### Subscription
