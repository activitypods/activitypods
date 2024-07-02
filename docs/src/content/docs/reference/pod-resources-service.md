---
title: PodResourcesService
---

This service, automatically created by the AppService with the key `pod-resources`, allows you to manage resources through the LDP protocol. See [this page](/app-framework/backend/reading-and-writing-resources) for usage examples.

## Actions

The following service actions are available.

### `post`

Post a resource on a given LDP container.

#### Parameters

| Property       | Type     | Description                                         |
| -------------- | -------- | --------------------------------------------------- |
| `containerUri` | `URI`    | Container where the resource will be created        |
| `resource`     | `Object` | Resource to create in JSON-LD format                |
| `actorUri`     | `URI`    | WebID of the Pod on which the action should be done |

:::note
If no `@context` is provided for the resource, the default context of the application will be used.
:::

#### Return value

The URI of the created resource, or `false` if the creation failed.

### `list`

Get a LDP container

#### Parameters

| Property       | Type  | Description                                         |
| -------------- | ----- | --------------------------------------------------- |
| `containerUri` | `URI` | Container to be fetched                             |
| `actorUri`     | `URI` | WebID of the Pod on which the action should be done |

#### Return value

An object with the following properties:

| Property     | Type      | Description                                   |
| ------------ | --------- | --------------------------------------------- |
| `ok`         | `Boolean` | `true` if the query succeeded                 |
| `status`     | `Number`  | The status code returned by the Pod provider  |
| `statusText` | `String`  | The status text returned by the Pod provider  |
| `body`       | `Object`  | A JSON-LD representation of the LDP container |
| `headers`    | `Object`  | The headers returned by the Pod provider      |

### `get`

Get a LDP resource

#### Parameters

| Property      | Type  | Description                                         |
| ------------- | ----- | --------------------------------------------------- |
| `resourceUri` | `URI` | Resource to be fetched                              |
| `actorUri`    | `URI` | WebID of the Pod on which the action should be done |

#### Return value

An object with the following properties:

| Property     | Type      | Description                                  |
| ------------ | --------- | -------------------------------------------- |
| `ok`         | `Boolean` | `true` if the query succeeded                |
| `status`     | `Number`  | The status code returned by the Pod provider |
| `statusText` | `String`  | The status text returned by the Pod provider |
| `body`       | `Object`  | A JSON-LD representation of the LDP resource |
| `headers`    | `Object`  | The headers returned by the Pod provider     |

### `patch`

#### Parameters

| Property          | Type    | Description                                                                                        |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `resourceUri`     | `URI`   | URI of resource to update                                                                          |
| `triplesToAdd`    | `Array` | Array of triples conforming with the [RDF.js data model](https://github.com/rdfjs-base/data-model) |
| `triplesToRemove` | `Array` | Array of triples conforming with the [RDF.js data model](https://github.com/rdfjs-base/data-model) |
| `actorUri`        | `URI`   | WebID of the Pod on which the action should be done                                                |

#### Return value

An object with the following properties:

| Property     | Type      | Description                                  |
| ------------ | --------- | -------------------------------------------- |
| `ok`         | `Boolean` | `true` if the query succeeded                |
| `status`     | `Number`  | The status code returned by the Pod provider |
| `statusText` | `String`  | The status text returned by the Pod provider |

### `put`

Update a resource, overwriting any existing data. This action should be used carefully, because if the resource was modified between the GET and the PUT, it will be lost. Use the `patch` method instead, whenever is possible.

#### Parameters

| Property   | Type     | Description                                         |
| ---------- | -------- | --------------------------------------------------- |
| `resource` | `Object` | Resource to update in JSON-LD format                |
| `actorUri` | `URI`    | WebID of the Pod on which the action should be done |

:::note
If no `@context` is provided for the resource, the default context of the application will be used.
:::

#### Return value

An object with the following properties:

| Property     | Type      | Description                                  |
| ------------ | --------- | -------------------------------------------- |
| `ok`         | `Boolean` | `true` if the query succeeded                |
| `status`     | `Number`  | The status code returned by the Pod provider |
| `statusText` | `String`  | The status text returned by the Pod provider |

### `delete`

Delete a resource.

#### Parameters

| Property      | Type  | Description                                         |
| ------------- | ----- | --------------------------------------------------- |
| `resourceUri` | `URI` | Resource to delete                                  |
| `actorUri`    | `URI` | WebID of the Pod on which the action should be done |

#### Return value

An object with the following properties:

| Property     | Type      | Description                                  |
| ------------ | --------- | -------------------------------------------- |
| `ok`         | `Boolean` | `true` if the query succeeded                |
| `status`     | `Number`  | The status code returned by the Pod provider |
| `statusText` | `String`  | The status text returned by the Pod provider |
