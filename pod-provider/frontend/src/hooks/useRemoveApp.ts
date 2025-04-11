import { useCallback } from 'react';
import urlJoin from 'url-join';
import { useDataProvider, useNotify } from 'react-admin';

const useRemoveApp = () => {
  const notify = useNotify();
  const dataProvider = useDataProvider();

  const removeApp = useCallback(
    async ({ application }: any) => {
      await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.auth-agent', 'remove-app'), {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ appUri: application.id })
      });

      // @ts-expect-error TS(2345): Argument of type 'Location' is not assignable to p... Remove this comment to see the full error message
      const currentUrl = new URL(window.location);
      const logoutUrl = new URL(application['oidc:post_logout_redirect_uris']);
      logoutUrl.searchParams.append('redirect', urlJoin(currentUrl.origin, '/apps?removed=true'));
      window.location.href = logoutUrl.toString();
    },
    [dataProvider, notify]
  );

  return removeApp;
};

export default useRemoveApp;
