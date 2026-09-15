import React from 'react';
import { useGetList, useTranslate } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import Header from '../../common/Header';
import RegisteredApps from './RegisteredApps';
import AvailableApps from './AvailableApps';
import { isLocalURL } from '../../utils';

const ApplicationsPage = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  const { identity } = useCheckAuthenticated();
  const { data: registeredApps, isLoading: isRegisteredAppsLoading } = useGetList('App', {
    // @ts-expect-error TS(2345): Argument of type '{ page: number; perPage: number;... Remove this comment to see the full error message
    page: 1,
    perPage: Infinity
  });
  const { data: trustedApps, isLoading: isTrustedAppsLoading } = useGetList('TrustedApp', {
    filter: { 'dc:language': identity?.webIdData?.['schema:knowsLanguage'] },
    // @ts-expect-error TS(2345): Argument of type '{ filter: { 'dc:language': any; ... Remove this comment to see the full error message
    page: 1,
    perPage: Infinity
  });

  if (isRegisteredAppsLoading) return null;

  return (
    <>
      <Header title="app.titles.applications" />
      <RegisteredApps registeredApps={registeredApps} trustedApps={trustedApps} />
      {!isLocalURL(CONFIG.BACKEND_URL) && !isTrustedAppsLoading && (
        <AvailableApps registeredApps={registeredApps} trustedApps={trustedApps} />
      )}
    </>
  );
};

export default ApplicationsPage;
