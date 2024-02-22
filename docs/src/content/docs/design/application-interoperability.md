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
- Applications don't declare `AccessDescription` for the time being (we can deduce the accesses requested, and later it may be used to justify access to certain resources).
- Pods only create `AccessGrants` and `DataGrants`, not `AccessAuthorizations` and `DataAuthorizations`. Grants can be shared with the registered application, while Authorizations cannot. The only difference between them is a `grantedWith` predicate in `AccessAuthorizations` that indicates which app was used to manage authorizations (but we manage that internally anyway).
- Pods don't declare `RegistrySet`, `ApplicationRegistry`, `AuthorizationRegistry` as they are not visible from the outside. We just read `ApplicationRegistrations`, `AccessGrants` and `DataGrants` in their dedicated containers.

## Type Indexes

👷 To be implemented ([#1171](https://github.com/assemblee-virtuelle/semapps/issues/1171))
