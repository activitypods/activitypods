import React, { useCallback, useEffect, useState, useLayoutEffect, FunctionComponent, ReactNode } from 'react';
import { useGetIdentity, useDataProvider, useTranslate, useLogout, useRedirect } from 'react-admin';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import { useNodeinfo } from '@semapps/activitypub-components';
import { arrayOf, delay } from '../utils';
import useGetAppStatus from '../hooks/useGetAppStatus';
import useRegisterApp from '../hooks/useRegisterApp';

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
  const translate = useTranslate();
  const logout = useLogout();
  const [appStatusChecked, setAppStatusChecked] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const nodeinfo = useNodeinfo(identity?.id ? new URL(identity?.id as string).host : undefined);
  const registerApp = useRegisterApp();
  const getAppStatus = useGetAppStatus();
  const redirect = useRedirect();

  const isLoggedOut = !isIdentityLoading && !identity?.id;

  if (!clientId) throw new Error(`Missing clientId prop for BackgroundChecks component`);

  const checkAppStatus = useCallback(async () => {
    // Only proceed if the tab is visible
    if (!document.hidden && identity?.id) {
      try {
        let appStatus = await getAppStatus();
        if (appStatus) {
          if (!appStatus.onlineBackend) {
            setErrorMessage(translate('apods.error.app_offline'));
            return;
          }

          if (!appStatus.installed) {
            await registerApp(clientId, identity.id as string);
            return;
          }

          if (appStatus.upgradeNeeded) {
            const { json: actor } = await dataProvider.fetch(identity.id);
            const { json: authAgent } = await dataProvider.fetch(actor['interop:hasAuthorizationAgent']);
            const redirectUrl = new URL(authAgent['interop:hasAuthorizationRedirectEndpoint']);
            redirectUrl.searchParams.append('client_id', clientId);
            window.location.href = redirectUrl.toString();
            return;
          }

          if (listeningTo.length > 0) {
            let numAttempts = 0,
              missingListener;

            do {
              missingListener = undefined;

              for (const uri of listeningTo) {
                if (!arrayOf(appStatus.webhookChannels).some(c => c.topic === uri)) {
                  missingListener = uri;
                }
              }

              // If one or more listener were not found, wait 1s and refetch the app status endpoint
              // This happens when the app was just registered, and the webhooks have not been created yet
              if (missingListener) {
                numAttempts++;
                await delay(1000);
                appStatus = await getAppStatus();
              }
            } while (missingListener && numAttempts < 10);

            if (missingListener) {
              setErrorMessage(translate('apods.error.app_not_listening', { uri: missingListener }));
              return;
            }
          }

          setAppStatusChecked(true);
        }
      } catch (e) {
        console.error(e);
        setErrorMessage(translate('apods.error.app_status_unavailable'));
      }
    }
  }, [
    identity,
    nodeinfo,
    getAppStatus,
    setAppStatusChecked,
    document,
    dataProvider,
    setErrorMessage,
    translate,
    registerApp,
    clientId
  ]);

  useEffect(() => {
    if (identity?.id && nodeinfo) {
      checkAppStatus();
      const timerId = setInterval(checkAppStatus, 120000);
      return () => clearInterval(timerId);
    }
  }, [identity, nodeinfo, checkAppStatus]);

  useEffect(() => {
    if (localStorage.getItem('redirect')) {
      redirect(localStorage.getItem('redirect')!);
    }
  }, [redirect]);

  useLayoutEffect(() => {
    document.addEventListener('visibilitychange', checkAppStatus);
    return () => document.removeEventListener('visibilitychange', checkAppStatus);
  }, [checkAppStatus]);

  if (isLoggedOut || appStatusChecked) {
    return children;
  } else if (errorMessage) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" sx={{ minHeight: 400 }}>
        <Box sx={{ backgroundColor: 'red', p: 2, textAlign: 'center' }}>
          <ErrorIcon sx={{ width: 50, height: 50, color: 'white' }} />
          <Typography color="white">{errorMessage}</Typography>
          <Button
            variant="contained"
            color="error"
            sx={{ mt: 2, mr: 1 }}
            onClick={() => {
              setErrorMessage(undefined);
              checkAppStatus();
            }}
          >
            {translate('ra.action.refresh')}
          </Button>
          <Button variant="contained" color="error" sx={{ mt: 2 }} onClick={() => logout()}>
            {translate('ra.auth.logout')}
          </Button>
        </Box>
      </Box>
    );
  } else {
    // TODO wait 3s before display loader
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" sx={{ minHeight: 400 }}>
        <CircularProgress size={100} thickness={6} sx={{ mb: 5, color: 'white' }} />
      </Box>
    );
  }
};

type Props = {
  clientId: string;
  listeningTo?: string[];
  children: ReactNode;
};

export default BackgroundChecks;
