---
title: Authorization
sidebar:
  order: 4
---

## Web Access Control

We support the full [WAC specification](https://solid.github.io/web-access-control-spec/).

## Access Control Policy

We do not support yet the [ACP specification](https://solid.github.io/authorization-panel/acp-specification/).

## Capability URLs

**Added in:** `activitypods@1.5`

We implement capability resources which are defined as [WAC](https://solid.github.io/web-access-control-spec/) Authorizations:

```json
{
  "@context": { "acl": "http://www.w3.org/ns/auth/acl#" },
  "@id": "https://myserver.com/capabilities/k3kleict5ks3r4",
  "@type": "acl:Authorization",
  "acl:accessTo": "https://myserver.com/resource/x",
  "acl:mode": "acl:Write"
}
```

Anyone who know the capability URL can access its corresponding resource like this:

```
GET /capabilities/k3kleict5ks3r4 HTTP/1.1
Host: myserver.com
Accept: application/ld+json
Authorization: Capability https://myserver.com/capabilities/k3kleict5ks3r4
```

The capability resource itself is not public, but it can be requested with its own URL in the `Authorization` header.

We are currently working on an implementation of the [ZCAP-LD spec](https://w3c-ccg.github.io/zcap-spec/) to make capabilities more secure and extensible.
