---
title: PodCollectionsService
---

This service, automatically created by the AppService with the key `pod-collections`, allows you to manage create collections, attach them to resources, and add/remove items. See [this page](/app-framework/backend/handling-collections) for usage examples.

## Actions

The following service actions are available.

### `createAndAttach`

Create a collection in the `/as/collection` container, and attach it to the provided resource.

#### Parameters

| Property            | Type     | Description                                             |
| ------------------- | -------- | ------------------------------------------------------- |
| `resourceUri`       | `String` | Resource to which the collection should be attached     |
| `attachPredicate`   | `URI`    | Predicate used to attach the collection to the resource |
| `collectionOptions` | `Object` | See below                                               |
| `actorUri`          | `URI`    | WebID of the Pod on which the action should be done     |

#### Return value

The URI of the newly created collection

### `deleteAndDetach`

Delete a collection and detach it to the provided resource.

#### Parameters

| Property          | Type     | Description                                                             |
| ----------------- | -------- | ----------------------------------------------------------------------- |
| `resourceUri`     | `String` | Resource to which the collection was attached                           |
| `attachPredicate` | `URI`    | Full URI of the predicate used to attach the collection to the resource |
| `actorUri`        | `URI`    | WebID of the Pod on which the action should be done                     |

### `add`

Add an item to a collection.

#### Parameters

| Property        | Type  | Description                                         |
| --------------- | ----- | --------------------------------------------------- |
| `collectionUri` | `URI` | URI of the collection                               |
| `itemUri`       | `URI` | URI of the item to be added                         |
| `actorUri`      | `URI` | WebID of the Pod on which the action should be done |

### `remove`

Remove an item from a collection.

#### Parameters

| Property        | Type  | Description                                         |
| --------------- | ----- | --------------------------------------------------- |
| `collectionUri` | `URI` | URI of the collection                               |
| `itemUri`       | `URI` | URI of the item to be removed                       |
| `actorUri`      | `URI` | WebID of the Pod on which the action should be done |

### `createAndAttachMissing`

Create and attach a collection to all resources of all registered Pods for a given type (when no such collection already exist).

#### Parameters

| Property            | Type     | Description                                             |
| ------------------- | -------- | ------------------------------------------------------- |
| `type`              | `URI`    | Type of resources to watch for                          |
| `attachPredicate`   | `URI`    | Predicate used to attach the collection to the resource |
| `collectionOptions` | `Object` | See below                                               |

## Collection options

The following options are available when creating a new collection. They are persisted using the `semapps:` ontology.

#### `ordered`

**Type:** `Boolean`
**Default:** `false`

If true, a `as:OrderedCollection` will be created. Other a `as:Collection` will be created.

#### `summary`

**Type:** `String`

Description attached to the collection

#### `itemsPerPage`

**Type:** `Integer`
**Default:** `undefined` (No pagination)

If you want to activate collection pagination, set the number of items per page.

#### `dereferenceItems`

**Type:** `Boolean`
**Default:** `false`

If true, all items will be dereferenced (if permissions allow).

#### `sortPredicate`

**Type:** `URI`
**Default:** `as:published`

Predicate that will be used to sort items in ordered collections

#### `sortOrder`

**Type:** `URI`
**Default:** `semapps:DescOrder`

`semapps:DescOrder` for descending order, or `semapps:AscOrder` for ascending order
