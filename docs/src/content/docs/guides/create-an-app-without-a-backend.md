---
title: Create an app without a backend
sidebar:
  order: 2
---

An ActivityPods app doesn't always need a backend. If it only reads and writes the data of the logged-in user, a frontend is enough: its description and its access needs can be served as static files.

This guide shows you how to generate these files with [`@activitypods/app-manifest`](/reference/frontend/app-manifest/). The [frontend-only example app](https://github.com/activitypods/frontend-only-example-app) is a complete example of the result.

## Is it the right choice ?

Without a backend, your app can't:

- Do anything when the user is not using it, such as sending notifications or reacting to activities.
- Access the data other users have shared, as this requires signing requests.
- Store data of its own, outside of the Pods of its users.

If you need any of these, follow the guide [Create your first social app](../create-your-first-social-app/) instead.

## Set up the manifest

This guide assumes you have a [Refine](https://refine.dev) app using Vite. See the [frontend introduction](/app-framework/frontend/introduction/) to install the Refine packages.

In your frontend directory, run:

```bash
npx @activitypods/app-manifest init
```

It asks for the name and the description of your app, creates an `app-manifest.json` file and installs the package.

Then add the plugin to your Vite configuration:

```ts title="vite.config.ts"
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { appManifest } from '@activitypods/app-manifest/vite';

export default defineConfig({
  plugins: [react(), appManifest()]
});
```

If you use TypeScript, add this line to your `vite-env.d.ts` file:

```ts title="src/vite-env.d.ts"
/// <reference types="@activitypods/app-manifest/client" />
```

## Configure the auth provider

The plugin provides the client ID of your app, so you don't have to write its URL:

```ts title="src/providers.ts"
import { authProvider as apAuthProvider } from '@activitypods/refine-providers';
import { clientId } from 'virtual:app-manifest';

export const authProvider = apAuthProvider({
  clientId,
  // Already done by the BackgroundChecks component
  appStatusCheckInterval: false
});
```

Use the [`BackgroundChecks`](/app-framework/frontend/auth-provider/) component around your authenticated routes. It sends the user to the authorization screen as soon as they open the app, if its access needs have changed:

```tsx
import { Authenticated } from '@refinedev/core';
import { ThemedLayout } from '@refinedev/antd';
import { CatchAllNavigate } from '@refinedev/react-router';
import { Outlet } from 'react-router';
import { BackgroundChecks } from '@activitypods/refine-antd';

<Authenticated key="authenticated-routes" fallback={<CatchAllNavigate to="/login" />}>
  <ThemedLayout>
    <BackgroundChecks>
      <Outlet />
    </BackgroundChecks>
  </ThemedLayout>
</Authenticated>;
```

Mount the `LoginPage` component on the `/login` route, as explained on the [auth provider](/app-framework/frontend/auth-provider/#login-page) page. The generated documents use this route to bring the user back to your app.

## Declare the access needs

To say which data your app needs, run:

```bash
npx app-manifest add
```

The command lists the shapes of the [shape repository](https://shapes.activitypods.org), with the number of apps using them, as well as the special rights. You can filter them by typing a word after the command:

```bash
npx app-manifest add message
```

It then asks if the access is required, and if your app needs to read or also to write the data. To skip the questions, for example in a script, use the options:

```bash
npx app-manifest add as/Note --write --required
npx app-manifest add apods:ReadInbox --optional
```

The result is written to `app-manifest.json`, which you can also edit by hand. Use `npx app-manifest list` to see what is declared, and `npx app-manifest check` to verify that the shape trees exist.

If you can't find the right shape, you can [create your own shape tree](../add-new-types-of-data-to-your-app/), or propose one on the shape repository. To add a shape tree hosted elsewhere, pass its URI to `npx app-manifest add`.

The data provider must know which shape tree each resource uses:

```ts title="src/providers.ts"
import { dataProvider as apDataProvider } from '@activitypods/refine-providers';

export const dataProvider = apDataProvider({
  authProvider,
  resources: {
    posts: {
      shapeTreeUri: 'https://shapes.activitypods.org/shapetrees/as/Note'
    }
  }
});
```

## Run the app

Start your app with `yarn dev`, then log in with an account on a Pod provider. The Pod provider must be able to reach your app: in development, it must run on the same machine.

The [frontend-only example app](https://github.com/activitypods/frontend-only-example-app) includes a `docker-compose.yml` file to run a local Pod provider. You should see the authorization screen, with the access needs you declared.

## Change the access needs

Users are asked for their consent again when the access needs of your app change. You only have to edit the manifest and deploy your app.

| Change                                     | What the user sees                                 |
| ------------------------------------------ | -------------------------------------------------- |
| New required access need or special right  | The authorization screen, with only what is new    |
| New optional access need                   | The authorization screen, where they can refuse it |
| Access need or special right removed       | Nothing: the upgrade is done automatically         |
| Fewer access modes on an access need       | Nothing: the upgrade is done automatically         |
| Other changes, such as the name of the app | Nothing                                            |

With `BackgroundChecks`, the check is done when the app is opened, then every two minutes and each time the user comes back to the tab.

:::caution
Your app doesn't get the new access until the user has accepted it, so it must handle the case of a user who hasn't upgraded yet.
:::

## Deploy to production

Set `PUBLIC_URL` to the URL of your app when building:

```bash
PUBLIC_URL=https://example.app yarn build
```

Then serve the output directory with any static web server, with two conditions:

- **The JSON documents must be served with the header `Access-Control-Allow-Origin: *`**. Otherwise, the authorization screen can't read your access needs. For example, `serve` needs an option:

  ```bash
  serve -s dist --cors
  ```

- **The URL of your app must not change.** It identifies your app in the Pods of your users: with a new URL, they would have to register the app again.
