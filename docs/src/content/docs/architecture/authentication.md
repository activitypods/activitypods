---
title: Authentication
sidebar:
  order: 3
---

## Solid-OIDC

Each Pod provider is an OIDC provider, and users log in to applications with their Pod account through [Solid-OIDC](https://solidproject.org/TR/oidc). Applications are identified by their Client ID document (see [Application registration](/app-framework/backend/application-registration/)). This is detailed in [#121](https://github.com/assemblee-virtuelle/activitypods/issues/121).

We do not support DPoP yet: the access token is passed as a bearer token, so it is not accepted by other Solid servers. To request resources on other servers, the frontend should use the [proxy endpoint](#proxy-endpoint) of the user.

## HTTP Signature

HTTP signature is the [recommended](https://www.w3.org/wiki/SocialCG/ActivityPub/Authentication_Authorization#Signing_requests_using_HTTP_Signatures) way to authenticate for server-to-server ActivityPub interactions. It is generally used when POSTing to other inboxes. We have extended its use so that it can be used on any endpoint, including LDP routes. This is how application backends authenticate when they read or write the Pods of their users, using the WebID of the application.

There is now a [proposal](https://solid.github.io/httpsig/) to integrate HTTP signature in the Solid protocol.

### Proxy endpoint

The ActivityPub specification [mentions](https://www.w3.org/TR/activitypub/#actor-objects) a `as:proxyUrl` predicate (included in the `as:endpoint` predicate of the actor) with the following description:

> Endpoint URI so this actor's clients may access remote ActivityStreams objects which require authentication to access. To use this endpoint, the client posts an `x-www-form-urlencoded` id parameter with the value being the `id` of the requested ActivityStreams object.

We have implemented this endpoint, and we have extended it for non-GET methods using the `multipart/form-data` Content-Type.

To do that, you may pass a [`multipart/form-data`](https://developer.mozilla.org/en-US/docs/Web/API/FormData/Using_FormData_Objects) Content-Type with the following fields:

- `id`: The URI of the resource
- `method`: The HTTP method to use (default to `GET`)
- `headers`: The HTTP headers to pass to the request (in JSON format)
- `body`: The body of the request (optional)

## Linked Data Signature

In addition to HTTP signature, it is [recommended](https://www.w3.org/wiki/SocialCG/ActivityPub/Authentication_Authorization#Linked_Data_Signatures) to also verify content posted to inboxes with Linked Data Signatures in order to increase security. This is implemented by only a few ActivityPub-compatible softwares (notably Mastodon), and none enforces it at the moment.

## WebID-TLS

Considering [WebID-TLS](https://www.w3.org/2005/Incubator/webid/spec/tls/) authentication mechanism, used before Solid-OIDC, is now only an option, we will not implement it.
