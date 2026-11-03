---
title: Auth provider
sidebar:
  order: 1
---

Users log in to ActivityPods apps with [Solid-OIDC](https://solidproject.org/TR/oidc): they choose their Pod provider, log in there, and come back to the app. The first time, the Pod provider also asks them to grant the app the access needs it declared (see [application registration](../../backend/application-registration/)).

## Configuration

```ts
import { authProvider } from '@activitypods/refine-providers';

export default authProvider({
  // The URI of your app, as declared by its backend
  clientId: 'http://localhost:3001/app',
  // Optional. Defaults to `${window.location.origin}/login`
  redirectUri: 'http://localhost:4001/login'
});
```

The `redirectUri` must be one of the `redirectUris` declared in the `oidc` settings of your backend's [AppService](../../backend/application-registration/).

## Login page

The `LoginPage` component of `@activitypods/refine-antd` handles every step of the login: choice of the Pod provider, completion of the OIDC flow, and registration of the app. Mount it on the `redirectUri` route, outside of the authenticated routes:

```tsx
import { LoginPage } from '@activitypods/refine-antd';

<Route path="/login" element={<LoginPage />} />;
```

By default, it lists the [public Pod providers](https://activitypods.org/data/pod-providers) matching the current locale. You can change this with these props:

| Prop                 | Description                                                                   |
| -------------------- | ----------------------------------------------------------------------------- |
| `defaultPodProvider` | Offer only this Pod provider (useful for a local Pod provider in development) |
| `customPodProviders` | A list of `{ 'apods:baseUrl': string, 'apods:area'?: string }` objects        |
| `redirect`           | Where to go once logged in. Defaults to `/`                                   |
| `text`               | Text shown above the Pod providers                                            |

The page also handles these search params: `?signup` to go through the Pod provider's signup form, `?iss=<url>` to log in directly to a Pod provider, `?logout` to log out, and `?redirect=<path>`.

To build a login page with another UI library, use the `useLoginFlow` hook of `@activitypods/refine-hooks`, which returns `{ isProcessing, error, podProviders, login, backToLogin }`.

## Background checks

The `BackgroundChecks` component checks regularly (every 2 minutes, and whenever the tab becomes visible again) the app status on the user's Pod:

- If the app's access needs changed since the user registered the app, the user is sent to the Pod provider to grant them.
- If the app's backend is offline, or if it doesn't listen to the URIs passed as `listeningTo`, an error is shown instead of the app.

Wrap your authenticated routes with it:

```tsx
import { useGetIdentity } from '@refinedev/core';
import { ThemedLayout } from '@refinedev/antd';
import { BackgroundChecks } from '@activitypods/refine-antd';

const Layout = ({ children }) => {
  const { data: identity } = useGetIdentity();
  return (
    <BackgroundChecks listeningTo={[identity?.webIdData?.inbox, identity?.webIdData?.outbox].filter(Boolean)}>
      <ThemedLayout>{children}</ThemedLayout>
    </BackgroundChecks>
  );
};
```

When you use this component, pass `appStatusCheckInterval: false` to the auth provider. Otherwise, the auth provider does a lighter check on its own: it only sends the user to the Pod provider if the access needs changed. The `useBackgroundChecks` hook lets you implement your own component.

:::caution[Apps without backend]
For apps without backend, the Pod provider detects that the access needs changed by comparing the `dc:modified` property of the app description (`app.json`) with the one it saw when the user registered the app. This property must be typed as `xsd:dateTime` in your JSON-LD context, and written without fractional seconds (`2026-08-05T00:00:00Z`). Only change it when the access needs change, otherwise all users will be asked again to grant them.
:::

## Identity

`useGetIdentity()` returns the user's WebID as `id`, a `name` and an `avatar` taken from their profile, as well as the raw `webIdData` and `profileData`. You can use `webIdData` to find the user's `inbox`, `outbox` or other collections.
