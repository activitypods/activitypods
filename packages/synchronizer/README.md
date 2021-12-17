# Synchronizer App

An [ActivityPods](../../README.md) app to notify of objects' updates.

When a watched object is updated, automatically send an activity to the actors who have the right to view this object.


## Action

### `watch`

Watch a new type of object.

##### Parameters
| Property | Type | Default | Description                           |
|----------| ---- | ------- |---------------------------------------|
| `type`   | `String`  | **required** | The type of resource we want to watch |


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
