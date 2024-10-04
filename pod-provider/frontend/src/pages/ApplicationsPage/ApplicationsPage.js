import React from 'react';
import { useGetList } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import InstalledApps from './InstalledApps';
import AvailableApps from './AvailableApps';
import { isLocalURL } from '../../utils';

const ApplicationsPage = () => {
  const { identity } = useCheckAuthenticated();
  const { data: installedApps, isLoading: isInstalledAppsLoading } = useGetList('App', {
    page: 1,
    perPage: Infinity
  });
  const { data: trustedApps, isLoading: isTrustedAppsLoading } = useGetList('TrustedApp', {
    filter: { 'dc:language': identity?.webIdData?.['schema:knowsLanguage'] },
    page: 1,
    perPage: Infinity
  });

  if (isInstalledAppsLoading) return null;

  return (
    <>
      <InstalledApps installedApps={installedApps} trustedApps={trustedApps} />
      {!isLocalURL(CONFIG.BACKEND_URL) && !isTrustedAppsLoading && (
        <AvailableApps installedApps={installedApps} trustedApps={trustedApps} />
      )}
    </>
  );
};

export default ApplicationsPage;
