import { authProvider } from '@semapps/auth-provider';
import dataProvider from './dataProvider';

// @ts-expect-error TS(2345): Argument of type '{ dataProvider: SemanticDataProv... Remove this comment to see the full error message
export default authProvider({
  dataProvider,
  authType: 'local',
  checkPermissions: true
});
