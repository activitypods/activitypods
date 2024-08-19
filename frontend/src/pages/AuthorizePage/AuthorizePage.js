import React, { useEffect, useCallback, useState } from 'react';
import { useGetList, useGetOne, useDataProvider } from 'react-admin';
import urlJoin from 'url-join';
import { useSearchParams } from 'react-router-dom';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import useTrustedApps from '../../hooks/useTrustedApps';
import useGetAppStatus from '../../hooks/useGetAppStatus';
import InstallationScreen from './InstallationScreen';

const AuthorizePage = () => {
  useCheckAuthenticated();
  const [screen, setScreen] = useState();
  const trustedApps = useTrustedApps();
  const [searchParams] = useSearchParams();
  const getAppStatus = useGetAppStatus();
  const dataProvider = useDataProvider();

  const appUri = searchParams.get('client_id');
  const redirectTo = searchParams.get('redirect');
  const interactionId = searchParams.get('interaction_id');
  const isTrustedApp = trustedApps?.some(baseUrl => baseUrl === new URL(appUri).origin) || false;

  const { data: application } = useGetOne('App', { id: appUri });
  const { data: appRegistrations, isLoading } = useGetList('AppRegistration', { page: 1, perPage: Infinity });

  const accessApp = useCallback(async () => {
    await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.oidc/consent-completed'), {
      method: 'POST',
      body: JSON.stringify({ interactionId }),
      headers: new Headers({ 'Content-Type': 'application/json' })
    });

    window.location.href = redirectTo;
  }, [dataProvider, interactionId, redirectTo]);

  useEffect(() => {
    (async () => {
      if (!isLoading && application?.id) {
        if (appRegistrations.some(reg => reg['interop:registeredAgent'] === application.id)) {
          const appStatus = await getAppStatus(application.id);
          if (appStatus.updated) {
            setScreen('upgrade');
          } else {
            accessApp();
          }
        } else {
          setScreen('install');
        }
      }
    })();
  }, [appRegistrations, isLoading, application, accessApp, getAppStatus, setScreen]);

  switch (screen) {
    case 'install':
      return <InstallationScreen application={application} accessApp={accessApp} isTrustedApp={isTrustedApp} />;

    // case 'upgrade':
    //   return <UpgradeScreen />

    default:
      return null;
  }
};

export default AuthorizePage;
