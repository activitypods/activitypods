import { authProvider as semappsAuthProvider } from '@semapps/auth-provider';
import { httpClient } from '@semapps/semantic-data-provider';

const authProvider = semappsAuthProvider({
  middlewareUri: process.env.REACT_APP_POD_PROVIDER_URL,
  allowAnonymous: true,
  localAccounts: true,
  httpClient,
  checkPermissions: true,
});

export default authProvider;
