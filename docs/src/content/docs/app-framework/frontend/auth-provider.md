---
title: Auth provider
sidebar:
  order: 1
---

Please have a look at [SemApps documentation on auth provider](https://semapps.org/docs/frontend/auth-provider) for more informations.

Basically, you just need to use the "solid-oidc" `authType`, and you must pass your application URI as `clientId`.

```js
import { authProvider } from '@semapps/auth-provider';
import dataProvider from './dataProvider';

export default authProvider({
  dataProvider,
  authType: 'solid-oidc',
  checkPermissions: true,
  allowAnonymous: false,
  clientId: 'http://localhost:3001/app'
});
```
