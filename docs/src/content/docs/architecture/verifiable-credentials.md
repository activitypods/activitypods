---
title: Verifiable Credentials
sidebar:
  order: 7
---

**Added in:** `activitypods@2.2`

Pods can issue, present and verify [Verifiable Credentials](https://www.w3.org/TR/vc-data-model-2.0/) (VCs). They are signed with the Ed25519 key of the user (the `assertionMethod` of their [WebID](/architecture/identity/#keys)), using [Data Integrity proofs](https://www.w3.org/TR/vc-data-integrity/) and the `eddsa-rdfc-2022` cryptosuite. Anyone can verify them by dereferencing the key from the WebID.

Their main use is [capabilities](#capabilities): authorizations which the user gives to the holder of a credential, even if this holder doesn't have a Pod yet. This is how contact links work.

## VC API

Every Pod exposes a subset of the [VC API v0.3](https://w3c-ccg.github.io/vc-api/) at `/alice/vc/v0.3`:

| Endpoint                                | Authentication | Description                                                  |
| --------------------------------------- | -------------- | ------------------------------------------------------------ |
| `POST /credentials/issue`               | Required       | Issue a credential signed by the user                        |
| `POST /credentials/verify`              | Required       | Verify a credential                                          |
| `POST /presentations`                   | Required       | Create a presentation signed by the user                     |
| `POST /presentations/verify`            | Required       | Verify a presentation                                        |
| `POST /presentations/verify-capability` | Required       | Verify a [capability presentation](#presenting-a-capability) |
| `POST /challenges`                      | None           | Get a challenge to include in a presentation                 |
| `POST /data-integrity/sign`             | Required       | Sign any JSON-LD object                                      |
| `POST /data-integrity/verify`           | Required       | Verify a signed JSON-LD object                               |

Requests can be authenticated with the token of the Pod provider frontend, or with the Solid-OIDC token of an application. In both cases, the credentials are issued and signed in the name of the user.

## Issuing a credential

Post the credential to the `credentials/issue` endpoint. Only `credentialSubject` is required: the `@context`, `type` and `issuer` are added if they are missing.

```http
POST /alice/vc/v0.3/credentials/issue
Authorization: Bearer <token>
Content-Type: application/json

{
  "credential": {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      { "schema": "https://schema.org/" }
    ],
    "type": "VerifiableCredential",
    "name": "Member of the association",
    "validUntil": "2027-12-31T23:59:59Z",
    "credentialSubject": {
      "id": "https://other.pod.provider/bob",
      "schema:memberOf": { "id": "https://mypod.store/alice" }
    }
  }
}
```

The Pod stores the credential in the `/alice/credentials` container and returns it, with its `id` and its `proof`:

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2", { "schema": "https://schema.org/" }],
  "id": "https://mypod.store/alice/credentials/8b0c1e3f-...",
  "type": "VerifiableCredential",
  "issuer": "https://mypod.store/alice",
  "name": "Member of the association",
  "validUntil": "2027-12-31T23:59:59Z",
  "credentialSubject": {
    "id": "https://other.pod.provider/bob",
    "schema:memberOf": { "id": "https://mypod.store/alice" }
  },
  "proof": {
    "type": "DataIntegrityProof",
    "cryptosuite": "eddsa-rdfc-2022",
    "created": "2026-11-09T10:00:00Z",
    "verificationMethod": "https://mypod.store/alice#...",
    "proofPurpose": "assertionMethod",
    "proofValue": "z5Ckt..."
  }
}
```

By default, the stored credential can be read by anyone who knows its URI, which is not guessable. This makes it easy to share it with a link. Add `"noAnonRead": true` next to `credential` if only the user should be able to read it.

If you provide an `id` in the credential, it is signed and returned but not stored.

Credentials are not revocable for now. To limit their lifetime, use `validFrom` and `validUntil`.

### Listing the credentials

The credentials issued by the user are stored in the `/alice/credentials` LDP container. They are typed `cred:VerifiableCredential` (`https://www.w3.org/2018/credentials#VerifiableCredential`).

To delete a credential, send a `DELETE` request to its URI. This doesn't invalidate the copies which may have been made.

## Verifying a credential

Post the credential to the `credentials/verify` endpoint of the user's Pod:

```http
POST /alice/vc/v0.3/credentials/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "verifiableCredential": { ... }
}
```

The response is `{ "verified": true }`, or `{ "verified": false, "error": ... }`. The signature is checked against the key published in the WebID of the issuer, so credentials issued on other Pod providers can be verified too. It is still up to you to check that the issuer is the one you expect, and that the content of `credentialSubject` makes sense.

## Capabilities

A capability is a credential whose `credentialSubject` describes what its holder is allowed to do. Two kinds of permissions are understood by the Pods:

- `apods:hasAuthorization`: an `acl:Authorization` which gives read access to some resources. The issuer must have the `acl:Control` right on these resources.
- `apods:hasActivityGrant`: an activity template. The holder can send activities which match this template to the inbox of the issuer, if an activity handler supports it.

If `credentialSubject.id` is set, only this actor can use the capability, and they can delegate it by issuing a new capability whose `issuer` is their own WebID (chains of 2 credentials maximum). If it is not set, anyone who has the credential can use it, but it cannot be delegated.

For example, the contact links of the Pod provider frontend are capabilities issued without a holder. They give read access to the profile of the user, and allow to send a contact request which will be accepted automatically:

```http
POST /alice/vc/v0.3/credentials/issue
Authorization: Bearer <token>
Content-Type: application/json

{
  "credential": {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      {
        "as": "https://www.w3.org/ns/activitystreams#",
        "apods": "http://activitypods.org/ns/core#",
        "acl": "http://www.w3.org/ns/auth/acl#"
      }
    ],
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
}
```

The link is then `https://<frontend>/invite/<encoded URI of the credential>`.

### Presenting a capability

To read a resource with a capability, put the credential in a presentation, encode it as an unsigned JWT (`"alg": "none"`), and use it as a bearer token. Since the presentation is not signed, this only works with capabilities which have no holder.

```js
const base64url = str =>
  btoa(String.fromCodePoint(...new TextEncoder().encode(str)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const presentation = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: 'VerifiablePresentation',
  verifiableCredential: [capability]
};

const token = `${base64url(JSON.stringify({ typ: 'JWT', alg: 'none' }))}.${base64url(JSON.stringify(presentation))}.`;

const response = await fetch(resourceUri, { headers: { Authorization: `Bearer ${token}` } });
```

To send an activity with a capability, the presentation must be signed by the actor sending the activity. First get a challenge from the Pod of the issuer, then create the presentation with the Pod of the holder:

```http
POST /alice/vc/v0.3/challenges
```

```http
POST /bob/vc/v0.3/presentations
Authorization: Bearer <token>
Content-Type: application/json

{
  "presentation": {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    "type": "VerifiablePresentation",
    "verifiableCredential": [{ ... }]
  },
  "options": {
    "challenge": "<challenge>",
    "persist": false
  }
}
```

Add the returned presentation to the activity, in the `capability` property (`sec:capability`), and post it to the outbox:

```json
{
  "@context": ["https://www.w3.org/ns/activitystreams", "https://mypod.store/.well-known/context.jsonld"],
  "type": "Offer",
  "actor": "https://other.pod.provider/bob",
  "to": "https://mypod.store/alice",
  "target": "https://mypod.store/alice",
  "object": {
    "type": "Add",
    "object": "https://other.pod.provider/bob/data/..."
  },
  "capability": { ... }
}
```

When the activity is received, the Pod of the issuer checks the signatures, that the actor is the holder of the presentation, that the first credential was issued by the recipient, and that the activity matches the `apods:hasActivityGrant` template. Only then is it passed to the activity handler.
