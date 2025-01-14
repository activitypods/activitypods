import { useCallback } from 'react';
import urlJoin from 'url-join';
import { useDataProvider, useNotify } from 'react-admin';

const useRemoveApp = () => {
  const notify = useNotify();
  const dataProvider = useDataProvider();

  const removeApp = useCallback(
    async ({ appUri }) => {
      try {
        notify('app.notification.app_uninstallation_in_progress');

        await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.auth-agent', 'uninstall'), {
          method: 'POST',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ appUri })
        });

        const currentUrl = new URL(window.location);
        const logoutUrl = new URL(app['oidc:post_logout_redirect_uris']);
        logoutUrl.searchParams.append('redirect', urlJoin(currentUrl.origin, '/apps?uninstalled=true'));
        window.location.href = logoutUrl.toString();
      } catch (e) {
        notify(`Error on app installation: ${e.message}`, { type: 'error' });
      }
    },
    [dataProvider, notify]
  );

  return removeApp;
};

export default useRemoveApp;
