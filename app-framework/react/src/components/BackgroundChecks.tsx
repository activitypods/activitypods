import { useCallback, useEffect, useState, useLayoutEffect, FunctionComponent, ReactNode } from 'react';
import urlJoin from 'url-join';
import { useGetIdentity, useNotify, useDataProvider } from 'react-admin';
import { useNodeinfo } from '@semapps/activitypub-components';
import { arrayOf } from '../utils';
import type { AppStatus } from '../types';

/**
 * Call the /.well-known/app-status endpoint to check the status of the app
 * If the app backend is offline or not installed, display an error message
 * If the app need to be upgraded, redirect the user to the /authorize page
 * If the app is not listening to the provided URLs, display an error message
 * Check this every 2 minutes or whenever the window becomes visible again
 */
const BackgroundChecks: FunctionComponent<Props> = ({ clientId, listeningTo = [], children }) => {
  const { data: identity, isLoading: isIdentityLoading } = useGetIdentity();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [appStatusChecked, setAppStatusChecked] = useState<boolean>(false);
  const nodeinfo = useNodeinfo(identity?.id ? new URL(identity?.id as string).host : undefined);

  const isLoggedOut = !isIdentityLoading && !identity?.id;

  if (!clientId) throw new Error(`Missing clientId prop for BackgroundChecks component`);

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
            if (!appStatus.onlineBackend) {
              notify('apods.error.app_offline', { type: 'error' });
              return;
            }

            if (!appStatus.installed) {
              notify('apods.error.app_not_installed', { type: 'error' });
              return;
            }

            if (appStatus.upgradeNeeded) {
              const { json: actor } = await dataProvider.fetch(identity.id);
              const { json: authAgent } = await dataProvider.fetch(actor['interop:hasAuthorizationAgent']);
              // No application registration found, redirect to the authorization agent
              const redirectUrl = new URL(authAgent['interop:hasAuthorizationRedirectEndpoint']);
              redirectUrl.searchParams.append('client_id', clientId);
              window.location.href = redirectUrl.toString();
              return;
            }

            if (listeningTo.length > 0) {
              for (const uri of listeningTo) {
                if (!arrayOf(appStatus.webhookChannels).some(c => c.topic === uri)) {
                  notify('apods.error.app_not_listening', { messageArgs: { uri }, type: 'error' });
                  return;
                }
              }
            }

            setAppStatusChecked(true);
          }
        }
      } catch (e) {
        console.error(e);
        notify('apods.error.app_status_unavailable', { type: 'error' });
      }
    }
  }, [identity, nodeinfo, setAppStatusChecked, document, dataProvider]);

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
  if (isLoggedOut || appStatusChecked) {
    return children;
  } else {
    return null;
  }
};

type Props = {
  clientId: string;
  listeningTo?: string[];
  children: ReactNode;
};

export default BackgroundChecks;
