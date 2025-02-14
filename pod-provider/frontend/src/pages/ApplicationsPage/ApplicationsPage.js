import React from 'react';
import { useGetList, useTranslate } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { Helmet } from 'react-helmet';
import RegisteredApps from './RegisteredApps';
import AvailableApps from './AvailableApps';
import { isLocalURL } from '../../utils';

const ApplicationsPage = () => {
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
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
      <Helmet>
        <title>{translate('app.titles.applications', { appName: CONFIG.INSTANCE_NAME })}</title>
      </Helmet>
      <RegisteredApps registeredApps={registeredApps} trustedApps={trustedApps} />
      {!isLocalURL(CONFIG.BACKEND_URL) && !isTrustedAppsLoading && (
        <AvailableApps registeredApps={registeredApps} trustedApps={trustedApps} />
      )}
    </>
  );
};

export default ApplicationsPage;
