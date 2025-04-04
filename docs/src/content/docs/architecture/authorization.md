---
title: Authorization
sidebar:
  order: 4
---

## Web Access Control (WAC)

We support the full [WAC specification](https://solid.github.io/web-access-control-spec/), except the `WAC-Allow` header [#837](https://github.com/assemblee-virtuelle/semapps/issues/837)

## Access Control Policy

We do not support yet the [ACP specification](https://solid.github.io/authorization-panel/acp-specification/).

## Capabilities with Verifiable Credentials

**Added in:** `activitypods@2.2`

We support capabilities based on Verifiable Credentials. For example, you can issue capabilities to read and write ACL-controlled resources and to perform certain types of ActivityPub activities (if the activity handler supports it).
See the SemApps documentation for more: https://semapps.org/docs/middleware/crypto/verifiable-credentials.
