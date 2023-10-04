---
layout: ~/layouts/MdLayout.astro
title: ActivityPub conformance
---

Apart from a few side-effects which would be quick to implement if need arised, ActivityPods is 100% compatible with ActivityPub, and supports both client-to-server and server-to-server interactions.

### Outbox

### Inbox

### Create/Update/Delete

It's possible to create, update or delete any kind of objects. Objects are automatically stored in the corresponding containers.

### Follow

Every ActivityStreams actor is automatically attached `as:followers` and `as:following` collections. Whenever a Follow activity is detected, it will add

The `Undo > Follow` activity is also supported.

### Like

Every ActivityStreams actor is automatically attached a `as:liked` collection

Every ActivityStreams object is automatically attached a `as:likes` collection, as soon as a Like is detected (?). If you want non-ActivityStreams objects to have a `as:likes` collection, you should add the type `as:Object`.

The `Undo > Like` activity is also supported.

### Announce

The `as:shares` is not implemented yet. However we have a custom `apods:announces` and `apods:announcers` collections (see below).

### Add/Remove

Not implemented yet.

### Block

Not implemented yet.

### HTTP signature authentication

### Proxy endpoint
