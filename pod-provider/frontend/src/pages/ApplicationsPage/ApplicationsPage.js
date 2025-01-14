import React from 'react';
import { useGetList } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import RegisteredApps from './RegisteredApps';
import AvailableApps from './AvailableApps';
import { isLocalURL } from '../../utils';

const ApplicationsPage = () => {
  const { identity } = useCheckAuthenticated();
  const { data: registeredApps, isLoading: isRegisteredAppsLoading } = useGetList('App', {
    page: 1,
    perPage: Infinity
  });
  const { data: trustedApps, isLoading: isTrustedAppsLoading } = useGetList('TrustedApp', {
    filter: { 'dc:language': identity?.webIdData?.['schema:knowsLanguage'] },
    page: 1,
    perPage: Infinity
  });

  if (isRegisteredAppsLoading) return null;

  return (
    <>
      <RegisteredApps registeredApps={registeredApps} trustedApps={trustedApps} />
      {
        /*!isLocalURL(CONFIG.BACKEND_URL) && */ !isTrustedAppsLoading && (
          <AvailableApps registeredApps={registeredApps} trustedApps={trustedApps} />
        )
      }
    </>
  );
};

export default ApplicationsPage;
