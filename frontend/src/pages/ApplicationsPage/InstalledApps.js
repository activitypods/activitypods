import React, { useCallback } from 'react';
import { useTranslate, useNotify, useGetOne } from 'react-admin';
import { Box, Typography, Grid, useMediaQuery } from '@mui/material';
import { useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';
import ApplicationCard from './ApplicationCard';

const AppRegistration = ({ appRegistration, trustedApps }) => {
  const notify = useNotify();
  const outbox = useOutbox();
  const { data: app, isLoading } = useGetOne('App', { id: appRegistration['interop:registeredAgent'] });
  const isTrustedApp = trustedApps?.some(baseUrl => baseUrl === appRegistration['interop:registeredAgent']) || false;

  const uninstallApp = useCallback(async () => {
    await outbox.post({
      '@context': ['https://www.w3.org/ns/activitystreams', { apods: 'http://activitypods.org/ns/core#' }],
      type: ACTIVITY_TYPES.UNDO,
      actor: outbox.owner,
      object: {
        type: 'apods:Install',
        object: app.id
      }
    });

    notify('app.notification.app_uninstallation_in_progress');

    // TODO await Accept response in inbox
    // notify('app.notification.app_uninstalled', { type: 'success' });

    setTimeout(() => {
      window.location.href = app['oidc:post_logout_redirect_uris'];
    }, 5000);
  }, [app, outbox, notify]);

  if (isLoading) return null;

  return <ApplicationCard app={app} isTrustedApp={isTrustedApp} isInstalled uninstallApp={uninstallApp} />;
};

const InstalledApps = ({ appRegistrations, trustedApps }) => {
  const translate = useTranslate();
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });

  if (appRegistrations?.length === 0) return null;

  return (
    <>
      <Typography variant="h2" component="h1" sx={{ mt: 2 }}>
        {translate('app.page.apps')}
      </Typography>
      <Box mt={1} mb={5}>
        <Grid container spacing={xs ? 1 : 3}>
          {appRegistrations.map(appRegistration => (
            <Grid item xs={12} sm={6}>
              <AppRegistration appRegistration={appRegistration} trustedApps={trustedApps} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </>
  );
};

export default InstalledApps;
