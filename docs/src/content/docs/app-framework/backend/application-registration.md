---
title: Application registration
sidebar:
  order: 1
---

Application registration is a complex process [as can be read here](../../architecture/application-interoperability/). Fortunately, we handle it behind the scene so you have nothing to do except configuring a few settings.

## `AppService`

Here is an example of a configuration:

```js
const { AppService } = require('@activitypods/app');

module.exports = {
  mixins: [AppService],
  settings: {
    app: {
      name: 'Example App',
      description: 'An ActivityPods-compatible app',
      thumbnail: 'https://example.app/logo192.png'
    },
    oidc: {
      clientUri: 'https://example.app',
      redirectUris: 'https://example.app/auth-callback',
      postLogoutRedirectUris: 'https://example.app/login?logout=true',
      tosUri: 'https://example.app/termes-of-services'
    },
    accessNeeds: {
      required: [
        {
          registeredClass: 'https://www.w3.org/ns/activitystreams#Event',
          accessMode: ['acl:Read', 'acl:Write']
        },
        'apods:ReadInbox',
        'apods:ReadOutbox'
      ],
      optional: [
        {
          registeredClass: 'http://www.w3.org/2006/vcard/ns#Individual',
          accessMode: 'acl:Read'
        }
      ]
    },
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  }
};
```

### App description

The `app` part of the setting allow you to describe your application. These informations will be displayed to users when they first access your application.

- `name`: name of your application
- `description`: description of your application
- `thumbnail`: square logo of your application (ideally 192x192 pixels)
- `frontUrl`: front URL of your application

### OIDC

ActivityPods integrate a full OIDC provider. To register your application with this provider, it needs a few informations:

- `clientUri`: The frontend URL
- `redirectUris`: The URL to redirect after login. If you use React-Admin, it will usually be `/auth-callback`
- `postLogoutRedirectUris`: The URL to redirect after logout. This URL should delete any token.
- `tosUri`: The URL to your terms of service (not used for now)

### Access needs

Access needs can be either `required` or `optional`. On the authorization screen, the user will be able to toggle out the optional access needs, but not the required access needs, since the application is not supposed to work without them.

#### Resource types

You can define the resources classes that you want to interact with, either in read or write mode.

If the resource classes is not yet handled by any other application, it will automatically create a LDP container, such as `/as/event` for ActivityStreams events. The ontology prefix is found using [prefix.cc](https://prefix.cc/). If you use a custom ontology which is not listed in this website, you will get an error, so be sure to add it yourself.

#### Special rights

The following special rights are allowed:

- `apods:ReadInbox`: permission to read and [watch](../listening-to-inbox-and-outbox/) the user's inbox
- `apods:ReadOutbox`: permission to read and [watch](../listening-to-inbox-and-outbox/) the user's outbox
- `apods:PostOutbox`: permission to [post as the user](../posting-as-the-user/)
- `apods:SendNotification`: permission to [send notifications](../sending-notifications/)
- `apods:CreateWacGroup`: permission to [create WAC groups](../handling-permissions/#creating-wac-groups)
- `apods:CreateCollection`: permission to [create custom collections](../handling-collections/)
- `apods:UpdateWebId`: permission to update the Pod's owner [WebID](/architecture/identity/#webid)
