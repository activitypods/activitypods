---
title: '@activitypods/refine-hooks'
sidebar:
  order: 1
---

React hooks to use inside a `<Refine>` component configured with the [auth provider](/reference/frontend/refine-providers/#authprovider) of `@activitypods/refine-providers`. They require `@refinedev/core` 5 and `@tanstack/react-query` 5.

## `useAuthProvider`

Return the auth provider given to Refine, with its [additional methods](/reference/frontend/refine-providers/#additional-methods). It throws an error if it wasn't created with `@activitypods/refine-providers`.

```ts
const session = useAuthProvider().getSession();
```

## `useCollection`

Fetch an ActivityPub collection. See [Inbox & outbox](/app-framework/frontend/inbox-and-outbox/#reading-collections) for an example.

```ts
const { items, hasNextPage, fetchNextPage } = useCollection(predicateOrUri);
```

### Parameters

| Parameter        | Type     | Description                                                                                                                      |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `predicateOrUri` | `String` | URI of the collection, or a predicate of the user's WebID such as `inbox` or `apods:contacts`. Nothing is fetched if it is empty |

### Return value

| Property             | Type       | Description                                                                |
| -------------------- | ---------- | -------------------------------------------------------------------------- |
| `items`              | `Array`    | Items of the pages fetched so far: URIs, or objects for the embedded items |
| `url`                | `String`   | URI of the collection                                                      |
| `isLoading`          | `Boolean`  | `true` during the first fetch                                              |
| `isSuccess`          | `Boolean`  | `true` when the collection has been fetched                                |
| `error`              | `Error`    | The error of the last fetch. Requests are not retried                      |
| `refetch`            | `Function` | Fetch the collection again                                                 |
| `hasNextPage`        | `Boolean`  | `true` if there are more pages                                             |
| `fetchNextPage`      | `Function` | Fetch the next page                                                        |
| `isFetchingNextPage` | `Boolean`  | `true` during the fetch of the next page                                   |
| `addItem`            | `Function` | Add an item at the beginning of the list, without any request              |
| `removeItem`         | `Function` | Remove an item from the list, without any request                          |

## `useOutbox`

Post activities to the user's outbox. See [Inbox & outbox](/app-framework/frontend/inbox-and-outbox/#posting-to-the-outbox) for an example.

```ts
const { post, url, owner } = useOutbox({ jsonContext });
```

### Parameters

| Parameter     | Type  | Default                  | Description                       |
| ------------- | ----- | ------------------------ | --------------------------------- |
| `jsonContext` | `Any` | ActivityStreams' context | JSON-LD context of the activities |

### Return value

| Property | Type       | Description                                                                                   |
| -------- | ---------- | --------------------------------------------------------------------------------------------- |
| `post`   | `Function` | Post the given activity and return its URI. It throws an error if the outbox is not known yet |
| `url`    | `String`   | URI of the outbox                                                                             |
| `owner`  | `String`   | WebID of the user                                                                             |

## `useLoginFlow`

The logic of the login page, to build it with another UI library. It must be used on the `redirectUri` route of the auth provider.

```ts
const { isProcessing, error, podProviders, login, backToLogin } = useLoginFlow(options);
```

### Options

| Property             | Type     | Default | Description                                                                                 |
| -------------------- | -------- | ------- | ------------------------------------------------------------------------------------------- |
| `defaultPodProvider` | `String` |         | Offer only this Pod provider                                                                |
| `customPodProviders` | `Array`  |         | The Pod providers to offer, as `{ 'apods:baseUrl': string, 'apods:area'?: string }` objects |
| `redirect`           | `String` | `/`     | Where to go once logged in                                                                  |

Without any of the first two options, the hook fetches the [public Pod providers](https://activitypods.org/data/pod-providers) matching the current locale.

### Return value

| Property       | Type       | Description                                                                    |
| -------------- | ---------- | ------------------------------------------------------------------------------ |
| `isProcessing` | `Boolean`  | `true` while the OIDC flow is being completed. Display a loader or the `error` |
| `error`        | `String`   | The error to display                                                           |
| `podProviders` | `Array`    | The Pod providers to offer                                                     |
| `login`        | `Function` | Redirect to the given Pod provider                                             |
| `backToLogin`  | `Function` | Go back to the list of Pod providers                                           |

### Search params

| Param              | Description                                                                |
| ------------------ | -------------------------------------------------------------------------- |
| `?signup`          | Go through the signup form of the Pod provider when logging in             |
| `?iss=<url>`       | Log in directly to this Pod provider                                       |
| `?logout`          | Log out the user                                                           |
| `?redirect=<path>` | Where to go once logged in. It takes precedence over the `redirect` option |
| `?code`            | Complete the OIDC flow. Added by the Pod provider                          |
| `?register_app`    | Check that the app is registered. Added by the hook                        |

## `useBackgroundChecks`

Check the app status while the user is logged in, to build your own version of the [`BackgroundChecks`](/reference/frontend/refine-antd/#backgroundchecks) component. Checks are done regularly and whenever the tab becomes visible again.

```ts
const { isLoggedOut, isChecked, error, retry } = useBackgroundChecks({ listeningTo, checkInterval });
```

If the app is not registered or if its access needs changed, the user is redirected to the authorization screen of the Pod provider. When they come back, the hook returns to the page they were on.

### Options

| Property        | Type              | Default  | Description                                                             |
| --------------- | ----------------- | -------- | ----------------------------------------------------------------------- |
| `listeningTo`   | `Array`           | `[]`     | URIs on which the app backend must have a webhook channel               |
| `checkInterval` | `Number \| false` | `120000` | Interval in ms between checks. With `false`, there is no periodic check |

### Return value

| Property      | Type       | Description                                                                                        |
| ------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `isLoggedOut` | `Boolean`  | `true` if the user is not logged in                                                                |
| `isChecked`   | `Boolean`  | `true` once a check has succeeded                                                                  |
| `error`       | `String`   | The error to display if the backend is offline, doesn't listen to the URIs, or if the check failed |
| `retry`       | `Function` | Check again                                                                                        |

## `useResourceRedirect`

Handle the links coming from the data browser of the Pod provider. The boilerplate uses it on the `/r` route, which is advertised as the `resource_url` in its [nodeinfo](https://github.com/activitypods/app-boilerplate/blob/master/backend/services/core/nodeinfo.service.js).

```ts
useResourceRedirect({ resources, jsonContext });
```

### Parameters

| Parameter     | Type     | Default                  | Description                             |
| ------------- | -------- | ------------------------ | --------------------------------------- |
| `resources`   | `Object` | **required**             | The same value as for the data provider |
| `jsonContext` | `Any`    | ActivityStreams' context | The same value as for the data provider |

### Search params

The hook finds the Refine resource matching the `type` param, then redirects:

| Params                             | Redirects to                  |
| ---------------------------------- | ----------------------------- |
| `?type=<type>&uri=<uri>`           | The show page of the resource |
| `?type=<type>&uri=<uri>&mode=edit` | The edit page of the resource |
| `?type=<type>`                     | The list page of the resource |
| Unknown or missing type            | The homepage                  |

## Translations

The hooks translate their texts with the `i18nProvider` given to Refine, using these keys and default texts:

| Key                                  | Default text                             |
| ------------------------------------ | ---------------------------------------- |
| `pages.login.podProvidersNotLoaded`  | Unable to load the list of Pod providers |
| `apods.error.app_offline`            | The app backend is offline               |
| `apods.error.app_not_listening`      | The app is not listening to `{{uri}}`    |
| `apods.error.app_status_unavailable` | Unable to check app status               |
