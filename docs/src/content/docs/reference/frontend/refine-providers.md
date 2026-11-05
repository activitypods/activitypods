---
title: '@activitypods/refine-providers'
sidebar:
  order: 0
---

The auth, data and live providers to connect a [Refine](https://refine.dev) app to ActivityPods Pods. It requires `@refinedev/core` 5. See the [auth provider](/app-framework/frontend/auth-provider/) and [data provider](/app-framework/frontend/data-provider/) pages for usage examples.

## `authProvider`

Create a Refine auth provider using the Solid-OIDC flow.

```ts
const apAuthProvider = authProvider({ clientId: 'http://localhost:3001/app' });
```

### Options

| Property                 | Type              | Default           | Description                                                                                                                           |
| ------------------------ | ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `clientId`               | `String`          | **required**      | URI of the app, used as the Solid-OIDC `client_id`                                                                                    |
| `redirectUri`            | `String`          | `${origin}/login` | URL where the Pod provider redirects after login. It must be one of the `redirectUris` declared by the app                            |
| `allowAnonymous`         | `Boolean`         | `false`           | If `false`, `check()` redirects to `/login` when there is no session                                                                  |
| `appStatusCheckInterval` | `Number \| false` | `120000`          | Interval in ms between checks of the access needs, also done when the tab becomes visible. Pass `false` if you use `BackgroundChecks` |

### Refine methods

| Method             | Description                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `login(params)`    | Redirect to the Pod provider. See the parameters below            |
| `register(params)` | Same as `login`, with the signup form of the Pod provider         |
| `logout()`         | Remove the session stored in the browser and redirect to `/login` |
| `check()`          | Tell if there is a valid session                                  |
| `onError(error)`   | Log out the user if the error status is 401                       |
| `getIdentity()`    | Return the [identity](#identity) of the user                      |
| `getPermissions()` | Always return `undefined`                                         |

The parameters of `login` and `register` are:

| Property   | Type      | Default      | Description                                    |
| ---------- | --------- | ------------ | ---------------------------------------------- |
| `issuer`   | `String`  | **required** | Base URL of the Pod provider                   |
| `redirect` | `String`  | `/`          | Path to redirect to once logged in             |
| `isSignup` | `Boolean` | `false`      | Go through the signup form of the Pod provider |

### Additional methods

| Method                | Description                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSession()`        | Return the current session as `{ token, webId }`, or `undefined` if there is none or if it expired                                                                |
| `handleCallback()`    | Complete the OIDC flow on the `redirectUri` route. Return `{ webId, redirect }`                                                                                   |
| `registerApp(webId?)` | Return the URI of the app registration. If the app is not registered, or if its access needs changed, redirect to the authorization screen and return `undefined` |
| `getAppStatus()`      | Return the [status of the app](#appstatus) on the Pod of the logged user                                                                                          |

## `dataProvider`

Create a Refine data provider which reads and writes resources on the Pod of the logged user.

```ts
const apDataProvider = dataProvider({ authProvider: apAuthProvider, resources, jsonContext });
```

### Options

| Property           | Type      | Default                  | Description                                                                                                     |
| ------------------ | --------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `authProvider`     | `Object`  | **required**             | The auth provider created above                                                                                 |
| `resources`        | `Object`  | **required**             | The configuration of each Refine resource. See [below](#resources)                                              |
| `jsonContext`      | `Any`     | ActivityStreams' context | JSON-LD context sent with created and updated resources, and used to expand the types                           |
| `readAccessGrants` | `Boolean` | `false`                  | Also list the resources found through the access grants of the app registration. This is slow and rarely needed |

### Resources

The keys of `resources` are the names of the Refine resources. Each value must have one of these properties:

| Property       | Type                | Description                                                                        |
| -------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `shapeTreeUri` | `String`            | URI of the shape tree of the resource. This is the recommended option              |
| `types`        | `String` or `Array` | Types of the resource, as CURIEs or full URIs. Used when `shapeTreeUri` is not set |

### Methods

| Method      | Description                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getList`   | Read the container of the resource. See [Lists](/app-framework/frontend/data-provider/#lists) for the supported filters, sorters and pagination                                |
| `getOne`    | Fetch a resource. Resources on other servers are fetched through the proxy of the user's Pod                                                                                   |
| `getMany`   | Same as `getOne` for several resources. The resources which cannot be fetched are left out                                                                                     |
| `create`    | Post the resource to its container, with the types of the resource, and return it as stored by the Pod                                                                         |
| `update`    | Fetch the current version of the resource, apply the given variables and replace it. The properties which are not in the variables, such as those added by a backend, are kept |
| `deleteOne` | Delete the resource                                                                                                                                                            |

The `custom` method is not implemented. To call other endpoints, use [`fetchWithSession`](#fetchwithsession).

## `liveProvider`

Create a Refine live provider using [WebSocket channels](https://solid.github.io/notifications/websocket-channel-2023). It requires Pod providers running a version of ActivityPods above 2.3.15.

### Options

| Property       | Type     | Default                  | Description                             |
| -------------- | -------- | ------------------------ | --------------------------------------- |
| `authProvider` | `Object` | **required**             | The auth provider created above         |
| `resources`    | `Object` | **required**             | The same value as for the data provider |
| `jsonContext`  | `Any`    | ActivityStreams' context | The same value as for the data provider |

### Subscriptions

| Watching        | Channel                                 | Events                               |
| --------------- | --------------------------------------- | ------------------------------------ |
| One or more IDs | One channel per resource                | `updated` and `deleted`              |
| A list          | One channel on the resource's container | `created` and `deleted` of its items |

Lists are not notified when one of their items is updated. Nothing happens for the resources which are not in `resources`.

## Utilities

### `fetchJson`

```ts
const { status, headers, json } = await fetchJson(url, options, token);
```

A wrapper around `fetch` which sets the JSON-LD `Accept` and `Content-Type` headers, adds the bearer token if there is one, and parses the response. If the response is not successful, it throws an error with the `status` and the `body` of the response.

### `fetchWithSession`

```ts
const { status, headers, json } = await fetchWithSession(url, options, session);
```

Same as `fetchJson`, as the logged user. A Pod only accepts the tokens it issued, so requests to other servers go through the proxy of the user's Pod, which signs them on behalf of the user. You can get the session with [`useAuthProvider`](/reference/frontend/refine-hooks/#useauthprovider).

### Other functions

| Function                                                               | Description                                                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `resolveAuthAgent(webId, token?)`                                      | Return `{ authAgent, appRegistrationUri }`: the authorization agent of the user, and the app registration if there is one |
| `resolveContainerUri(resource, resourceConfig, webId, token, context)` | Return the URI of the container of a resource, using the type indexes of the user                                         |
| `resolveResourceTypes(resourceConfig, context)`                        | Return the full URIs of the types of a resource                                                                           |
| `getTypesFromShapeTree(shapeTreeUri)`                                  | Return the full URIs of the types targeted by a shape tree                                                                |
| `expandTypes(types, context)`                                          | Expand CURIEs to full URIs                                                                                                |
| `fetchAppStatus(webId, token)`                                         | Return the [status of the app](#appstatus) on the Pod of the given user                                                   |
| `arrayOf(value)`                                                       | Return an array from a single value, an array, `null` or `undefined`                                                      |

### Constants

| Constant               | Description                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `DEFAULT_CONTEXT`      | The ActivityStreams context                                                                       |
| `SEARCH_FIELD`         | `q`: the field of the filter searching in all the fields of the resources                         |
| `NEAR_FIELD`           | `near`: the field of the filter keeping the resources near a location                             |
| `STORAGE_KEY_REDIRECT` | The `localStorage` key of the path where the user comes back when returning from the Pod provider |

## Types

### `Identity`

| Property      | Type     | Description                                        |
| ------------- | -------- | -------------------------------------------------- |
| `id`          | `String` | WebID of the user                                  |
| `name`        | `String` | Name found in the profile, or the WebID by default |
| `avatar`      | `String` | Picture found in the profile                       |
| `webIdData`   | `Object` | Content of the WebID                               |
| `profileData` | `Object` | Content of the profile                             |

### `AppStatus`

| Property          | Type                | Description                                                 |
| ----------------- | ------------------- | ----------------------------------------------------------- |
| `onlineBackend`   | `Boolean`           | `true` if the app backend is reachable, or if there is none |
| `installed`       | `Boolean`           | `true` if the app is registered on the Pod                  |
| `upgradeNeeded`   | `Boolean`           | `true` if the user must grant the access needs again        |
| `webhookChannels` | `Object` or `Array` | The webhook channels of the app backend on the Pod          |
