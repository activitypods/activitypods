---
title: '@activitypods/refine-antd'
sidebar:
  order: 2
---

[Ant Design](https://ant.design) components above the hooks of [`@activitypods/refine-hooks`](/reference/frontend/refine-hooks/). They require `antd` 5, `@ant-design/icons` 5 and `@refinedev/core` 5.

## `LoginPage`

Handle every step of the login. It must be mounted on the `redirectUri` route of the auth provider, outside of the authenticated routes. See the [auth provider](/app-framework/frontend/auth-provider/#login-page) page.

```tsx
<Route path="/login" element={<LoginPage />} />
```

### Props

| Prop                 | Type     | Default | Description                                                                                 |
| -------------------- | -------- | ------- | ------------------------------------------------------------------------------------------- |
| `defaultPodProvider` | `String` |         | Offer only this Pod provider                                                                |
| `customPodProviders` | `Array`  |         | The Pod providers to offer, as `{ 'apods:baseUrl': string, 'apods:area'?: string }` objects |
| `redirect`           | `String` | `/`     | Where to go once logged in                                                                  |
| `text`               | `String` |         | Text shown above the Pod providers                                                          |

The page handles the [search params](/reference/frontend/refine-hooks/#search-params) of `useLoginFlow`.

## `BackgroundChecks`

Check the app status while the user is logged in, and wrap the authenticated part of the app. See the [auth provider](/app-framework/frontend/auth-provider/#background-checks) page.

```tsx
<BackgroundChecks listeningTo={[inboxUri, outboxUri]}>{children}</BackgroundChecks>
```

Its children are displayed if the user is logged out, or once a check has succeeded. Before that, a loader is displayed. If there is an error, it is displayed with a button to check again and a button to log out.

When you use this component, pass `appStatusCheckInterval: false` to the auth provider.

### Props

| Prop            | Type              | Default  | Description                                                             |
| --------------- | ----------------- | -------- | ----------------------------------------------------------------------- |
| `listeningTo`   | `Array`           | `[]`     | URIs on which the app backend must have a webhook channel               |
| `checkInterval` | `Number \| false` | `120000` | Interval in ms between checks. With `false`, there is no periodic check |

## `ShareButton`

Open the share screen of the user's Pod provider, to choose who can access a resource, or all the resources of a type. The user then comes back to the current page. See [Sharing resources](/app-framework/contacts-and-sharing/#on-the-pod-provider).

```tsx
<ShareButton clientId={clientId} resource="events" recordItemId={record.id} />
```

The button is shown only if the [`accessControlProvider`](/reference/frontend/refine-providers/#accesscontrolprovider) allows the `share` action.

### Props

| Prop           | Type     | Default      | Description                                                                                                                                               |
| -------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clientId`     | `String` | **required** | Client ID of the app, shown on the share screen                                                                                                           |
| `resource`     | `String` |              | Resource of the data provider                                                                                                                             |
| `recordItemId` | `String` |              | URI of the resource to share. Without it, all the resources are shared: those with the `shapeTreeUri` of the resource, in the storage where it is created |

The other props are passed to the Ant Design `Button`.

## Translations

The components translate their texts with the `i18nProvider` given to Refine, using these keys and default texts. They also display the texts of the [hooks](/reference/frontend/refine-hooks/#translations).

| Key                             | Default text                                                 |
| ------------------------------- | ------------------------------------------------------------ |
| `pages.login.choosePodProvider` | Choose the Pod provider that hosts your ActivityPods account |
| `pages.login.backToLogin`       | Back to login                                                |
| `buttons.refresh`               | Refresh                                                      |
| `buttons.logout`                | Logout                                                       |
| `buttons.share`                 | Share                                                        |
