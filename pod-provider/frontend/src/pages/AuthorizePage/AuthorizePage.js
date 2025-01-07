import React, { useEffect, useCallback, useState } from 'react';
import { useGetList, useGetOne, useNotify } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import useTrustedApps from '../../hooks/useTrustedApps';
import useGetAppStatus from '../../hooks/useGetAppStatus';
import InstallationScreen from './InstallationScreen';
import UpgradeScreen from './UpgradeScreen';

const AuthorizePage = () => {
  useCheckAuthenticated();
  const [screen, setScreen] = useState();
  const trustedApps = useTrustedApps();
  const [searchParams] = useSearchParams();
  const getAppStatus = useGetAppStatus();
  const notify = useNotify();

  const appUri = searchParams.get('client_id');
  const isTrustedApp = trustedApps?.some(trustedApp => trustedApp.id === appUri) || false;

  const { data: application } = useGetOne('App', { id: appUri });
  const { data: appRegistrations, isLoading } = useGetList('AppRegistration', { page: 1, perPage: Infinity });

  const accessApp = useCallback(async () => {
    const redirectUrl = application['interop:hasAuthorizationCallbackEndpoint'];
    if (redirectUrl) {
      window.location.href = application['interop:hasAuthorizationCallbackEndpoint'];
    } else {
      notify('Cannot redirect to app because no interop:hasAuthorizationCallbackEndpoint is defined', {
        type: 'error'
      });
    }
  }, [application, notify]);

  useEffect(() => {
    (async () => {
      if (!isLoading && application?.id) {
        const appStatus = await getAppStatus(application.id);
        if (!appStatus.installed) {
          setScreen('install');
        } else if (appStatus.upgradeNeeded) {
          setScreen('upgrade');
        } else {
          accessApp();
        }
      }
    })();
  }, [appRegistrations, isLoading, application, accessApp, getAppStatus, setScreen]);

  switch (screen) {
    case 'install':
      return <InstallationScreen application={application} accessApp={accessApp} isTrustedApp={isTrustedApp} />;

    case 'upgrade':
      return <UpgradeScreen application={application} accessApp={accessApp} isTrustedApp={isTrustedApp} />;

    default:
      return null;
  }
};

export default AuthorizePage;
