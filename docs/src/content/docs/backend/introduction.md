---
title: Introduction
sidebar:
  order: 0
---

With ActivityPods, all applications have a backend part. Since the application is also an ActivityPub actor, it can communicate with the Pod in various ways.

At a minimum, this backend will handle [application registration](../application-registration/). This is where you will define your access needs, i.e. what kind of resources you need to read or write. There are also special rights that are specific to ActivityPods, such as the ability to listen to a user's inbox or outbox.

But you can easily extend the backend to handle side effects or "business logic":

- [Reading and writing resources](../reading-and-writing-resources/)
- [Listening to inbox & outbox](../listening-to-inbox-and-outbox/)
- [Posting as the user](../posting-as-the-user/)
- [Handling permissions](../handling-permissions/)
- [Handling collections](../handling-collections/)
- [Sending notifications](../sending-notifications/)
