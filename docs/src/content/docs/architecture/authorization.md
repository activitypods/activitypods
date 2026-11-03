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

We support capabilities based on Verifiable Credentials. For example, you can issue capabilities to read and write ACL-controlled resources and to perform certain types of ActivityPub activities (if the activity handler supports it).
The VC API is available at `/alice/vc/v0.3`. See the [SemApps documentation](https://semapps.org/docs/middleware/crypto/verifiable-credentials) for more details.

For example, the contact links of the Pod provider frontend are capabilities issued by the user. They allow their holder to read the user's private profile and to send them a contact request, which will be automatically accepted:

```json
{
  "type": "VerifiableCredential",
  "name": "Invite Link",
  "credentialSubject": {
    "apods:hasActivityGrant": {
      "type": "as:Offer",
      "as:to": { "@id": "https://mypod.store/alice" },
      "as:target": { "@id": "https://mypod.store/alice" },
      "as:object": {
        "type": "as:Add",
        "as:object": { "type": "as:Profile" }
      }
    },
    "apods:hasAuthorization": {
      "type": "acl:Authorization",
      "acl:mode": "acl:Read",
      "acl:accessTo": { "@id": "https://mypod.store/alice/data/73582847-1b89-4501-ab61-8f810e8c7178" }
    }
  }
}
```
