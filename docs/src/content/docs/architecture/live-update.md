---
title: Live update
sidebar:
  order: 6
---

Live update is a way to be notified of changes to a Pod in real time. For now, the main mechanism for live update are Solid Notifications.

## Solid Notifications

**Added in:** `activitypods@2.0`

Thanks to the [Solid Notifications Protocol](https://solid.github.io/notifications/protocol), you can listen to LDP resources, LDP containers or ActivityStreams collections.

We support discovering the notification subscription services through the storage description resource. This can be found by doing a HEAD request on any resource in your pod and looking for the `Link` header with the `http://www.w3.org/ns/solid/terms#storageDescription` relationship.

This leads to the `/.well-known/solid` endpoint which includes links to available subscription services.

```json
{
  "@context": { "notify": "http://www.w3.org/ns/solid/notifications#" },
  "@id": "http://localhost:3000/.well-known/solid",
  "@type": "http://www.w3.org/ns/pim/space#Storage",
  "notify:subscription": [
    "http://localhost:3000/.notifications/WebSocketChannel2023",
    "http://localhost:3000/.notifications/WebhookChannel2023"
  ]
}
```

### Webhooks subscription

To subscribe to the http://localhost:3000/foo resource using webhooks, you use an authenticated POST request to send the following JSON-LD document to the server, at http://localhost:3000/.notifications/WebhookChannel2023/:

```json
{
  "@context": ["https://www.w3.org/ns/solid/notifications-context/v1"],
  "type": "WebhookChannel2023",
  "topic": "http://localhost:3000/foo",
  "sendTo": "https://example.com/webhook"
}
```

The `sendTo` predicate is the Webhook URL of your server, the URL to which you want the notifications to be sent.

### WebSockets subscription

To subscribe to the http://localhost:3000/foo resource using WebSockets, you use an authenticated POST request to send the following JSON-LD document to the server, at http://localhost:3000/.notifications/WebSocketChannel2023/:

```json
{
  "@context": ["https://www.w3.org/ns/solid/notifications-context/v1"],
  "type": "WebhookChannel2023",
  "topic": "http://localhost:3000/foo"
}
```

The server will send back a subscription resource, in which the `notify:receiveFrom` predicate indicates the WebSocket channel.

### Notification types

Just like the [Community Solid Server](https://communitysolidserver.github.io/CommunitySolidServer), we support five different notification types that the client can receive. The format of the notification can slightly change depending on the type.

- **Create**: When the resource is created.
- **Update**: When the existing resource is changed.
- **Delete**: When the resource is deleted. Does not have a state field.

Additionally, when listening to a LDP container or an ActivityStreams collection, there are two extra notifications that are sent out when the contents of the container or collection change. For these notifications, the `object` field references the resource that was added or removed, while the new `target` field references the container or collection itself.

- **Add**: When a new resource is added to the container or collection.
- **Remove**: When a resource is removed from the container or collection.
