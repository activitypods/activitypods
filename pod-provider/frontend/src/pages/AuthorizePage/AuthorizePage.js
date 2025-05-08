import React, { useEffect, useCallback, useState } from 'react';
import { useGetIdentity, useGetList, useGetOne, useNotify } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import useTrustedApps from '../../hooks/useTrustedApps';
import useGetAppStatus from '../../hooks/useGetAppStatus';
import RegistrationScreen from './RegistrationScreen';
import UpgradeScreen from './UpgradeScreen';
import ShareScreen from './ShareScreen';
import { isURL } from '../../utils';

const AuthorizePage = () => {
  useCheckAuthenticated();
  const [screen, setScreen] = useState();
  const trustedApps = useTrustedApps();
  const [searchParams] = useSearchParams();
  const getAppStatus = useGetAppStatus();
  const { data: identity } = useGetIdentity();
  const notify = useNotify();

  const appUri = searchParams.get('client_id');
  const resourceUri = searchParams.get('resource');
  const isTrustedApp = trustedApps?.some(trustedApp => trustedApp.id === appUri) || false;

  const { data: application } = useGetOne('App', { id: appUri });
  const { data: appRegistrations, isLoading } = useGetList('AppRegistration', { page: 1, perPage: Infinity });

  const accessApp = useCallback(async () => {
    const redirectUrl = application['interop:hasAuthorizationCallbackEndpoint'];
    if (redirectUrl) {
      if (isURL(redirectUrl)) {
        window.location.href = application['interop:hasAuthorizationCallbackEndpoint'];
      } else {
        notify('Cannot redirect to app because the interop:hasAuthorizationCallbackEndpoint is not a valid URL', {
          type: 'error'
        });
      }
    } else {
      notify('Cannot redirect to app because no interop:hasAuthorizationCallbackEndpoint is defined', {
        type: 'error'
      });
    }
  }, [application, notify]);

  useEffect(() => {
    if (!isLoading && application?.id && identity?.id) {
      getAppStatus(application.id, identity).then(appStatus => {
        if (!appStatus.installed) {
          setScreen('register');
        } else if (appStatus.upgradeNeeded) {
          setScreen('upgrade');
        } else if (resourceUri) {
          setScreen('share');
        } else {
          accessApp();
        }
      });
    }
  }, [resourceUri, appRegistrations, isLoading, application, accessApp, getAppStatus, setScreen, identity]);

  switch (screen) {
    case 'register':
      return <RegistrationScreen application={application} accessApp={accessApp} isTrustedApp={isTrustedApp} />;

    case 'upgrade':
      return <UpgradeScreen application={application} accessApp={accessApp} isTrustedApp={isTrustedApp} />;

    case 'share':
      return <ShareScreen resourceUri={resourceUri} application={application} accessApp={accessApp} />;

    default:
      return null;
  }
};

export default AuthorizePage;
