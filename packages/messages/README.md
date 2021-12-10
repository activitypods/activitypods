# Messages App

An [ActivityPods](../../README.md) app to handle messages.

## Services

- [MessageService](services/message.js)

## Containers

- `/notes` with the messages sent by the user

## Handled activities

### Send message

```json
{
  "type": "Create",
  "object": {
    "type": "Note"
  }
}
```

#### Emitter's side effects

- None

#### Recipients' side effects

- Notifications are sent to the recipients
