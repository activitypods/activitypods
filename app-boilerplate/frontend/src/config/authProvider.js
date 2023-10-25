import { authProvider } from '@semapps/auth-provider';
import dataProvider from './dataProvider';

export default authProvider({
  dataProvider,
  authType: 'pod',
  checkPermissions: true,
  allowAnonymous: false
});
