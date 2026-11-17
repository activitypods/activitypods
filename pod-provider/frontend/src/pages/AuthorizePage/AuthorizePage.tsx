import React, { useEffect, useCallback, useState } from 'react';
import urlJoin from 'url-join';
import { useDataProvider, useGetIdentity, useGetOne, useNotify } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import useTrustedApps from '../../hooks/useTrustedApps';
import useGetAppStatus from '../../hooks/useGetAppStatus';
import RegistrationScreen from './RegistrationScreen';
import UpgradeScreen from './UpgradeScreen';
import ShareScreen from './ShareScreen';
import { isURL } from '../../utils';

const AuthorizePage = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useCheckAuthenticated();
  const [screen, setScreen] = useState();
  const trustedApps = useTrustedApps();
  const [searchParams] = useSearchParams();
  const getAppStatus = useGetAppStatus();
  const { data: identity } = useGetIdentity();
  const notify = useNotify();
  const dataProvider = useDataProvider();

  const appUri = searchParams.get('client_id');
  const resourceUri = searchParams.get('resource');
  const shapeTreeUri = searchParams.get('shapeTree');
  const podOwner = searchParams.get('podOwner');
  // The data spaces of groups on which the app is registered. Their members register the app without being asked.
  const storages = searchParams.getAll('storage');
  // When sharing, podOwner is the owner of the shared data. Otherwise, it is the pod on which the app is registered.
  const isSharing = !!(resourceUri || shapeTreeUri);
  const registrationPod = isSharing ? null : podOwner;
  const isTrustedApp = trustedApps?.some(trustedApp => trustedApp.id === appUri) || false;

  const { data: application } = useGetOne('App', { id: appUri });

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
    if (application?.id && identity?.id) {
      getAppStatus(application.id, identity, registrationPod).then(appStatus => {
        if (!appStatus.installed && storages.length > 0 && !registrationPod && !isSharing) {
          dataProvider
            .fetch(urlJoin(CONFIG.BACKEND_URL, '.auth-agent/app-registrations/register'), {
              method: 'POST',
              headers: new Headers({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ appUri: application.id, storages })
            })
            .then(() => accessApp())
            .catch((e: any) => notify(e.body?.message || e.message, { type: 'error' }));
        } else if (!appStatus.installed) {
          // @ts-expect-error TS(2345): Argument of type '"register"' is not assignable to... Remove this comment to see the full error message
          setScreen('register');
        } else if (appStatus.upgradeNeeded && registrationPod) {
          notify('The upgrade of an app registered on a group is not supported yet', { type: 'error' });
        } else if (appStatus.upgradeNeeded) {
          // @ts-expect-error TS(2345): Argument of type '"upgrade"' is not assignable to ... Remove this comment to see the full error message
          setScreen('upgrade');
        } else if (isSharing) {
          setScreen('share');
        } else {
          accessApp();
        }
      });
    }
  }, [
    isSharing,
    registrationPod,
    storages.join(),
    application,
    accessApp,
    getAppStatus,
    setScreen,
    identity,
    notify,
    dataProvider
  ]);

  switch (screen) {
    // @ts-expect-error TS(2678): Type '"register"' is not comparable to type 'undef... Remove this comment to see the full error message
    case 'register':
      return (
        <RegistrationScreen
          application={application}
          accessApp={accessApp}
          isTrustedApp={isTrustedApp}
          podOwner={registrationPod}
        />
      );

    // @ts-expect-error TS(2678): Type '"upgrade"' is not comparable to type 'undefi... Remove this comment to see the full error message
    case 'upgrade':
      return <UpgradeScreen application={application} accessApp={accessApp} isTrustedApp={isTrustedApp} />;

    case 'share':
      return (
        <ShareScreen resourceUri={resourceUri} shapeTreeUri={shapeTreeUri} podOwner={podOwner} accessApp={accessApp} />
      );

    default:
      return null;
  }
};

export default AuthorizePage;
