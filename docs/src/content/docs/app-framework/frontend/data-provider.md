---
title: Data provider
sidebar:
  order: 2
---

Please have a look at [SemApps documentation on the semantic data provider](https://semapps.org/docs/frontend/semantic-data-provider/) for more informations.

Here's an example below:

```js
import { dataProvider } from '@semapps/semantic-data-provider';

export default dataProvider({
  dataServers: {
    pod: {
      pod: true,
      authServer: true,
      default: true,
      containers: {
        pod: {
          'vcard:Individual': ['/vcard/individual'],
          'as:Event': ['/as/event']
        }
      },
      uploadsContainer: '/semapps/file'
    }
  },
  resources: {
    Contact: {
      types: ['vcard:Individual', 'as:Profile']
    },
    Event: {
      types: ['as:Event']
    }
  },
  ontologies: [
    {
      prefix: 'as',
      url: 'https://www.w3.org/ns/activitystreams#'
    },
    {
      prefix: 'vcard',
      url: 'http://www.w3.org/2006/vcard/ns#'
    }
  ],
  jsonContext: ['https://www.w3.org/ns/activitystreams', 'https://mypod.store/.well-known/context.jsonld']
});
```
