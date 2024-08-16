import React, { useCallback, useEffect } from 'react';
import urlJoin from 'url-join';
import { useSearchParams } from 'react-router-dom';
import { useTranslate, useNotify } from 'react-admin';
import { Box, Typography, Grid, useMediaQuery } from '@mui/material';
import { useOutbox, ACTIVITY_TYPES, useInbox } from '@semapps/activitypub-components';
import ApplicationCard from './ApplicationCard';

const AppRegistration = ({ app, isTrustedApp }) => {
  const notify = useNotify();
  const outbox = useOutbox();
  const inbox = useInbox();

  const uninstallApp = useCallback(async () => {
    try {
      notify('app.notification.app_uninstallation_in_progress');

      outbox.post({
        '@context': ['https://www.w3.org/ns/activitystreams', { apods: 'http://activitypods.org/ns/core#' }],
        type: ACTIVITY_TYPES.UNDO,
        actor: outbox.owner,
        object: {
          type: 'apods:Install',
          object: app.id
        }
      });

      // TODO Allow to pass an object, and automatically dereference it, like on the @semapps/activitypub matchActivity util
      const deleteRegistrationActivity = await outbox.awaitActivity(
        activity => activity.type === 'Delete' && activity.to === app.id
      );

      await inbox.awaitActivity(
        activity =>
          activity.type === 'Accept' && activity.actor === app.id && activity.object === deleteRegistrationActivity.id
      );

      const currentUrl = new URL(window.location);
      const logoutUrl = new URL(app['oidc:post_logout_redirect_uris']);
      logoutUrl.searchParams.append('redirect', urlJoin(currentUrl.origin, '/apps?uninstalled=true'));
      window.location.href = logoutUrl.toString();
    } catch (e) {
      notify(`Error on app installation: ${e.message}`, { type: 'error' });
    }
  }, [app, outbox, inbox, notify]);

  return <ApplicationCard app={app} isTrustedApp={isTrustedApp} isInstalled uninstallApp={uninstallApp} />;
};

const InstalledApps = ({ installedApps, trustedApps }) => {
  const notify = useNotify();
  const translate = useTranslate();
  const [searchParams] = useSearchParams();
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });

  useEffect(() => {
    if (searchParams.has('uninstalled')) {
      notify('app.notification.app_uninstalled', { type: 'success' });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [notify, searchParams]);

  if (installedApps?.length === 0) return null;

  return (
    <>
      <Typography variant="h2" component="h1" sx={{ mt: 2 }}>
        {translate('app.page.apps')}
      </Typography>
      <Box mt={1} mb={5}>
        <Grid container spacing={xs ? 1 : 3}>
          {installedApps?.map(installedApp => {
            const isTrustedApp = trustedApps?.some(baseUrl => baseUrl === installedApp.id) || false;
            return (
              <Grid key={installedApp.id} item xs={12} sm={6}>
                <AppRegistration app={installedApp} isTrustedApp={isTrustedApp} />
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </>
  );
};

export default InstalledApps;
