---
title: Authorization
sidebar:
  order: 4
---

## Web Access Control (WAC)

We support the full [WAC specification](https://solid.github.io/web-access-control-spec/), except the `WAC-Allow` header [#837](https://github.com/assemblee-virtuelle/semapps/issues/837)

The permissions given to applications and to other users through [SAI](/architecture/application-interoperability/) are converted to WAC permissions.

### WAC groups

Besides the groups created by applications (see [Handling permissions](/app-framework/backend/handling-permissions/)), the Pod provider creates the following groups:

| Group                                | Members                                       | Permissions                                      |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------ |
| `/_groups/alice/contacts`            | Alice's contacts                              | Read Alice's private profile                     |
| `/_groups/alice/data/.../announces`  | Actors with whom the resource has been shared | Read the resource and the profile of its creator |
| `/_groups/alice/data/.../announcers` | Actors who were allowed to share the resource | Read the `apods:announces` collection            |

## Access Control Policy

We do not support yet the [ACP specification](https://solid.github.io/authorization-panel/acp-specification/).

## Capabilities with Verifiable Credentials

**Added in:** `activitypods@2.2`

Users can issue capabilities as Verifiable Credentials, to give read access to some resources, or to allow certain types of activities to be sent to them. The contact links of the Pod provider frontend work this way. See [Verifiable Credentials](/architecture/verifiable-credentials/#capabilities).
