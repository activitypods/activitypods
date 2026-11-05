---
title: Introduction
sidebar:
  order: 0
---

Although you can use any framework to build an ActivityPods-compatible application, we provide packages to make it easier with [Refine](https://refine.dev), a React framework for data-intensive applications. Refine handles data fetching, caching (with [TanStack Query](https://tanstack.com/query/latest/)), forms and routing, and leaves you free to choose your UI library.

| Package                          | Content                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@activitypods/refine-providers` | The [auth provider](../auth-provider/) and the [data provider](../data-provider/), with no UI            |
| `@activitypods/refine-hooks`     | React hooks to handle the login flow, the app status and [ActivityPub collections](../inbox-and-outbox/) |
| `@activitypods/refine-antd`      | Ready-made components (login page, background checks) for [Ant Design](https://ant.design)               |

The [app boilerplate](https://github.com/activitypods/app-boilerplate) uses these three packages, with Ant Design. If your app doesn't need a backend, have a look at the [frontend-only example app](https://github.com/activitypods/frontend-only-example-app).

```bash
yarn add @activitypods/refine-providers @activitypods/refine-hooks @activitypods/refine-antd
```

If you prefer another UI library, you only need `@activitypods/refine-providers` and `@activitypods/refine-hooks`: the components of `@activitypods/refine-antd` are thin layers above the hooks.

The API of each package is described in the Reference: [`refine-providers`](/reference/frontend/refine-providers/), [`refine-hooks`](/reference/frontend/refine-hooks/) and [`refine-antd`](/reference/frontend/refine-antd/).

:::note
Previous versions of the boilerplate used [React-Admin](https://marmelab.com/react-admin/) and [SemApps](https://semapps.org/docs/frontend) components. The ActivityPods components for React-Admin are still available in the `@activitypods/react-admin` package (formerly `@activitypods/react`), but new apps should use Refine.
:::
