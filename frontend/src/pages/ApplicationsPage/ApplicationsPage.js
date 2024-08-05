import React from 'react';
import { useGetList } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import InstalledApps from './InstalledApps';
import AvailableApps from './AvailableApps';
import { isLocalURL } from '../../utils';

const ApplicationsPage = () => {
  useCheckAuthenticated();
  const { data: appRegistrations, isLoading: isAppRegistrationsLoading } = useGetList(
    'AppRegistration',
    {
      page: 1,
      perPage: Infinity
    },
    { staleTime: Infinity }
  );
  const { data: trustedApps, isLoading: isTrustedAppsLoading } = useGetList(
    'TrustedApp',
    {
      page: 1,
      perPage: Infinity
    },
    { staleTime: Infinity }
  );

  if (isAppRegistrationsLoading) return null;

  return (
    <>
      <InstalledApps appRegistrations={appRegistrations} trustedApps={trustedApps} />
      {!isLocalURL(CONFIG.BACKEND_URL) && !isTrustedAppsLoading && (
        <AvailableApps appRegistrations={appRegistrations} trustedApps={trustedApps} />
      )}
    </>
  );
};

export default ApplicationsPage;
