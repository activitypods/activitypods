# Synchronizer Service

An [ActivityPods](../../README.md) service to notify of objects' updates.

When a watched object is updated or deleted, automatically send an activity to the actors who have the right to view this object.


## Usage

The easiest way to make use of this service is to import the `SynchronizerMixin` along with the `ControlledContainerMixin`.

```js
const { ControlledContainerMixin } = require('@semapps/ldp');
const { SynchronizerMixin } = require('@activitypods/synchronizer');

module.exports = {
  name: 'events',
  mixins: [SynchronizerMixin, ControlledContainerMixin], // In that order
  settings: {
    path: '/events',
    acceptedTypes: ['Event']
  }
}
```

> Note: The `SynchronizerMixin` must be added before the `ControlledContainerMixin`, as it overrides its `delete` action.


## Actions

### `watch`

Watch a new type of object.

##### Parameters
| Property | Type     | Default      | Description                           |
|----------|----------|--------------|---------------------------------------|
| `type`   | `String` | **required** | The type of resource we want to watch |

### `announceUpdate`

Announce an object update to all actors who have the right to view this object.

##### Parameters
| Property    | Type     | Default      | Description                                |
|-------------|----------|--------------|--------------------------------------------|
| `objectUri` | `String` | **required** | The URI of resource which has been updated |
| `newData`   | `Object` | **required** | The content of the resource (in JSON-LD)   |

### `announceDelete`

Announce an object deletion to all actors who have the right to view this object.

##### Parameters
| Property    | Type     | Default      | Description                                                     |
|-------------|----------|--------------|-----------------------------------------------------------------|
| `objectUri` | `String` | **required** | The URI of resource which has been deleted                      |
| `oldData`   | `Object` | **required** | The content of the resource before it was deleted (in JSON-LD)  |


## Handled activities

### Announce update

```json
{
  "type": "Announce",
  "object": {
    "type": "Update",
    "object": {
      "type": "[WATCHED TYPES]"
    }
  }
}
```

#### Emitter's side effects

- None

#### Recipients' side effects

- The object cached in the recipients' PODs is refreshed

### Announce delete

```json
{
  "type": "Announce",
  "object": {
    "type": "Delete",
    "object": {
      "formerType": "[WATCHED TYPES]"
    }
  }
}
```

#### Emitter's side effects

- None

#### Recipients' side effects

- The object cached in the recipients' PODs is deleted
