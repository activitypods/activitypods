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

The URI of the created resource

### `list`

Get a LDP container

#### Parameters

| Property       | Type  | Description                                         |
| -------------- | ----- | --------------------------------------------------- |
| `containerUri` | `URI` | Container to be fetched                             |
| `actorUri`     | `URI` | WebID of the Pod on which the action should be done |

#### Return value

The JSON-LD representation of the LDP container, formatted with the context of the application.

### `get`

Get a LDP resource

#### Parameters

| Property      | Type  | Description                                         |
| ------------- | ----- | --------------------------------------------------- |
| `resourceUri` | `URI` | Resource to be fetched                              |
| `actorUri`    | `URI` | WebID of the Pod on which the action should be done |

#### Return value

The JSON-LD representation of the LDP resource, formatted with the context of the application.

### `patch`

#### Parameters

| Property          | Type    | Description                                                                                        |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `resourceUri`     | `URI`   | URI of resource to update                                                                          |
| `triplesToAdd`    | `Array` | Array of triples conforming with the [RDF.js data model](https://github.com/rdfjs-base/data-model) |
| `triplesToRemove` | `Array` | Array of triples conforming with the [RDF.js data model](https://github.com/rdfjs-base/data-model) |
| `actorUri`        | `URI`   | WebID of the Pod on which the action should be done                                                |

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

### `delete`

Delete a resource.

#### Parameters

| Property      | Type  | Description                                         |
| ------------- | ----- | --------------------------------------------------- |
| `resourceUri` | `URI` | Resource to delete                                  |
| `actorUri`    | `URI` | WebID of the Pod on which the action should be done |
