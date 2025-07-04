import { useCallback } from 'react';
import urlJoin from 'url-join';
import { useDataProvider } from 'react-admin';

const useUpgradeApp = () => {
  const dataProvider = useDataProvider();

  const upgradeApp = useCallback(
    async ({ appUri, grantedAccessNeeds }) => {
      await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.auth-agent/app-registrations/upgrade'), {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          appUri,
          acceptedAccessNeeds: grantedAccessNeeds.filter(a => !a.startsWith('apods:')),
          acceptedSpecialRights: grantedAccessNeeds.filter(a => a.startsWith('apods:'))
        })
      });
    },
    [dataProvider]
  );

  return upgradeApp;
};

export default useUpgradeApp;
