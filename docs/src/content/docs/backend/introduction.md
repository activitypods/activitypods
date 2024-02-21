---
title: Introduction
sidebar:
  order: 0
---

With ActivityPods, all applications have a backend part. Since the application is also an ActivityPub actor, it can communicate with the Pod in various ways.

At a minimum, this backend must handle [application registration](../application-registration/). This is where you will define your access needs, i.e. what kind of resources you need to read or write. There are also special rights that are specific to ActivityPods, such as the ability to listen to a user's inbox or outbox.

But you can easily extend the backend to handle side effects or "business logic":

- [Reading and writing resources](../reading-and-writing-resources/)
- [Listening to inbox & outbox](../listening-to-inbox-and-outbox/)
- [Posting as the user](../posting-as-the-user/)
- [Handling permissions](../handling-permissions/)
- [Handling collections](../handling-collections/)
- [Sending notifications](../sending-notifications/)

We use the [Moleculer](https://moleculer.service) framework, which allow to handle everything as micro-services. It relies itself on NodeJS.

## Developing with other languages

Since we are using documented standards and protocols, you can use any language you want to create your backend. In that case, you should have a look at the [design section](../../design/overall-architecture/) to know about these standards. But if you want to quickly try ActivityPods, we would recommend to test our built-in components.
