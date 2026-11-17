---
title: Identity
sidebar:
  order: 2
---

## WebID

All ActivityPub actors are also WebIDs. Besides the usual ActivityPub predicates, they link to the user's storage, to their [SAI registries](/architecture/application-interoperability/#registries) and to their contacts collections.

```json
{
  "@context": ["https://www.w3.org/ns/activitystreams", "https://mypod.store/.well-known/context.jsonld"],
  "id": "https://mypod.store/alice",
  "type": ["foaf:Person", "Person"],
  "dc:created": "2026-09-11T15:40:24.091Z",
  "dc:modified": "2026-09-17T08:28:09.387Z",
  "foaf:nick": "alice",
  "preferredUsername": "alice",
  "url": "https://mypod.store/alice/data/73582847-1b89-4501-ab61-8f810e8c7178",
  "schema:knowsLanguage": "en",
  "inbox": "https://mypod.store/alice/inbox",
  "outbox": "https://mypod.store/alice/outbox",
  "followers": "https://mypod.store/alice/followers",
  "following": "https://mypod.store/alice/following",
  "liked": "https://mypod.store/alice/liked",
  "endpoints": {
    "void:sparqlEndpoint": "https://mypod.store/alice/sparql",
    "proxyUrl": "https://mypod.store/alice/proxy"
  },
  "pim:storage": "https://mypod.store/alice/data",
  "pim:preferencesFile": "https://mypod.store/alice/data/463ff5b7-7213-46ca-9bb1-f36cb5dbdb28",
  "solid:oidcIssuer": "https://mypod.store",
  "solid:publicTypeIndex": "https://mypod.store/alice/data/6a9b29ab-0c28-4a62-a697-6cef35dc6b84",
  "interop:hasAuthorizationAgent": "https://mypod.store/alice/data/2b44e227-7e48-4a33-ae25-b158af27a6dc",
  "interop:hasRegistrySet": "https://mypod.store/alice/data/48b37600-54ee-430b-84fd-14f76228ef1e",
  "apods:contacts": "https://mypod.store/alice/contacts",
  "apods:contactRequests": "https://mypod.store/alice/contact-requests",
  "apods:rejectedContacts": "https://mypod.store/alice/rejected-contacts",
  "apods:ignoredContacts": "https://mypod.store/alice/ignored-contacts",
  "publicKey": {
    "id": "https://mypod.store/alice/data/2193c794-09a4-4410-af22-f539d35fef13",
    "type": ["https://www.w3.org/ns/auth/rsa#RSAKey", "sec:VerificationMethod"],
    "controller": "https://mypod.store/alice",
    "owner": "https://mypod.store/alice",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAtKNy7JpYt6wuPKVBCaDR\n...\n-----END PUBLIC KEY-----\n"
  },
  "assertionMethod": {
    "id": "https://mypod.store/alice/data/abc26b58-4ec0-4ce8-b742-86a41965a649",
    "type": ["urn:ed25519-key", "sec:Multikey", "sec:VerificationMethod"],
    "controller": "https://mypod.store/alice",
    "owner": "https://mypod.store/alice",
    "publicKeyMultibase": "z6Mktsx54kHD8sbAr7NMVJmB4QvZnQxRXPgbU8K532AfB1hu"
  }
}
```

The WebID is public and acts as a public profile. The `url` predicate links to the user's private profile (`as:Profile`), which is only visible to their contacts. Applications with the `apods:UpdateWebId` special right may add their own predicates to the WebID.

## Keys

Every actor has two key pairs:

- A RSA key (`publicKey`), used for [HTTP signatures](/architecture/authentication/#http-signature), as most Fediverse softwares expect.
- An Ed25519 key (`assertionMethod`), in the [Multikey](https://www.w3.org/TR/cid-1.0/#Multikey) format, used to sign [Verifiable Credentials](/architecture/verifiable-credentials/).

## Webfinger

[Webfinger](https://www.rfc-editor.org/rfc/rfc7033) allows to find an actor from a `@username@domain` identifier, as on Mastodon. This is what users enter on the Pod provider frontend to send a contact request.

```
GET https://mypod.store/.well-known/webfinger?resource=acct:alice@mypod.store
```

```json
{
  "subject": "acct:alice@mypod.store",
  "aliases": ["https://mypod.store/alice"],
  "links": [{ "rel": "self", "type": "application/activity+json", "href": "https://mypod.store/alice" }]
}
```
