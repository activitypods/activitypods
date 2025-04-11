import React from 'react';
import { useTranslate } from 'react-admin';
import { Box, Typography, Grid, useMediaQuery } from '@mui/material';
import ApplicationCard from './ApplicationCard';

const AvailableApps = ({ registeredApps, trustedApps }: any) => {
  const translate = useTranslate();
  // @ts-expect-error TS(2571): Object is of type 'unknown'.
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });

  // Filter out applications which are already registered
  const availableApps = trustedApps?.filter(
    (trustedApp: any) => !registeredApps.some((registerApp: any) => registerApp.id === trustedApp.id)
  );

  if (availableApps?.length === 0) return null;

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.available_apps')}
      </Typography>
      <Box mt={1}>
        <Grid container spacing={xs ? 1 : 3}>
          {availableApps.map((app: any) => (
            <Grid item xs={12} sm={6} key={app.id}>
              <ApplicationCard app={app} isTrustedApp isRegistered={false} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </>
  );
};

export default AvailableApps;
