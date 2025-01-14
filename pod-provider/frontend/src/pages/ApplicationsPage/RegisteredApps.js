import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslate, useNotify } from 'react-admin';
import { Box, Typography, Grid, useMediaQuery } from '@mui/material';
import ApplicationCard from './ApplicationCard';

const RegisteredApps = ({ registeredApps, trustedApps }) => {
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

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.apps')}
      </Typography>
      <Box mt={1} mb={5}>
        {registeredApps?.length === 0 && <Typography mb={5}>{translate('app.message.no_app_registration')}</Typography>}
        <Grid container spacing={xs ? 1 : 3}>
          {registeredApps?.map(registeredApp => {
            const isTrustedApp = trustedApps?.some(trustedApp => trustedApp.id === registeredApp.id) || false;
            return (
              <Grid key={registeredApp.id} item xs={12} sm={6}>
                <ApplicationCard app={registeredApp} isTrustedApp={isTrustedApp} isRegistered />
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </>
  );
};

export default RegisteredApps;
