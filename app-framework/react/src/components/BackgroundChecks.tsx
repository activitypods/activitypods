import { useCallback, useEffect, useState, useLayoutEffect, FunctionComponent, ReactNode } from 'react';
import urlJoin from 'url-join';
import { useGetIdentity, useNotify } from 'react-admin';
import { useNodeinfo } from '@semapps/activitypub-components';
import type { AppStatus } from '../types';

/**
 * Call the /.well-known/app-status endpoint to check the status of the app
 * If the app backend is offline, display an error message
 * If the app need to be upgraded, redirect the user to the /authorize page
 */
const BackgroundChecks: FunctionComponent<Props> = ({ clientId, children }) => {
  const { data: identity, isLoading: isIdentityLoading } = useGetIdentity();
  const notify = useNotify();
  const [appStatus, setAppStatus] = useState<AppStatus | undefined>();
  const nodeinfo = useNodeinfo(identity?.id ? new URL(identity?.id as string).host : undefined);

  const isLoggedOut = !isIdentityLoading && !identity?.id;

  const checkAppStatus = useCallback(async () => {
    // Only proceed if the tab is visible
    if (!document.hidden && identity?.id) {
      const oidcIssuer = new URL(identity?.id as 'string').origin;
      const endpointUrl = urlJoin(oidcIssuer, '.well-known/app-status');
      const token = localStorage.getItem('token');

      try {
        // Don't use dataProvider.fetch as it would go through the proxy
        const response = await fetch(endpointUrl, {
          headers: new Headers({ Authorization: `Bearer ${token}`, Accept: 'application/json' })
        });
        if (response.ok) {
          const appStatus = (await response.json()) as AppStatus;
          if (appStatus) {
            setAppStatus(appStatus);
            if (!appStatus.onlineBackend) {
              notify(`The app backend is offline`, { type: 'error' });
            } else if (!appStatus.installed) {
              notify(`The app is not installed`, { type: 'error' });
            } else if (appStatus.upgradeNeeded) {
              const consentUrl = new URL(nodeinfo?.metadata?.consent_url as 'string');
              consentUrl.searchParams.append('client_id', clientId);
              consentUrl.searchParams.append('redirect', window.location.href);
              window.location.href = consentUrl.toString();
            }
          }
        }
      } catch (e) {
        notify(`Unable to check app status`, { type: 'error' });
      }
    }
  }, [identity, nodeinfo, setAppStatus, document]);

  useEffect(() => {
    if (identity?.id && nodeinfo) {
      checkAppStatus();
      const timerId = setInterval(checkAppStatus, 120000);
      return () => clearInterval(timerId);
    }
  }, [identity, nodeinfo, checkAppStatus]);

  useLayoutEffect(() => {
    document.addEventListener('visibilitychange', checkAppStatus);
    return () => document.removeEventListener('visibilitychange', checkAppStatus);
  }, [checkAppStatus]);

  // TODO display error message instead of notifications
  if (
    isLoggedOut ||
    (appStatus?.onlineBackend === true && appStatus?.installed === true && appStatus?.upgradeNeeded === false)
  ) {
    return children;
  } else {
    return null;
  }
};

type Props = {
  clientId: string;
  children: ReactNode;
};

export default BackgroundChecks;
