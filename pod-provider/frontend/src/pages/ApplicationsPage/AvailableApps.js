import React from 'react';
import { useTranslate } from 'react-admin';
import { Box, Typography, Grid, useMediaQuery } from '@mui/material';
import ApplicationCard from './ApplicationCard';

const AvailableApps = ({ registeredApps, trustedApps }) => {
  const translate = useTranslate();
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });

  // Filter out applications which are already installed
  const availableApps = trustedApps?.filter(
    trustedApp => !registeredApps.some(registerApp => registerApp.id === trustedApp.id)
  );

  if (availableApps?.length === 0) return null;

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.available_apps')}
      </Typography>
      <Box mt={1}>
        <Grid container spacing={xs ? 1 : 3}>
          {availableApps.map(app => (
            <Grid item xs={12} sm={6} key={app.id}>
              <ApplicationCard app={app} isTrustedApp isInstalled={false} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </>
  );
};

export default AvailableApps;
