---
title: Introduction
sidebar:
  order: 0
---

Although you can use any framework to build an ActivityPods-compatible application, [SemApps](https://semapps.org) provide React components and hooks to facilitate frontend development.

SemApps rely on the excellent [React-Admin framework](https://marmelab.com/react-admin/), which in turn relies on high-quality libraries such as [MUI](https://mui.com/) and [TanStack Query](https://tanstack.com/query/latest/). React-Admin makes it very easy to manage data display, as well as forms. Initially designed as a tool to create admin frontends, it is flexible enough to handle any kind of application.

Note that the [data provider](../data-provider/) supplied by SemApps can be used outside React-Admin. We've managed to use it with [Astro](https://astro.build), for example.
