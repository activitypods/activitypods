import React from 'react';
import { useTranslate } from 'react-admin';
import { Box, Typography, Grid, useMediaQuery } from '@mui/material';
import ApplicationCard from './ApplicationCard';

const AvailableApps = ({ appRegistrations, trustedApps }) => {
  const translate = useTranslate();
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });

  console.log('trustedApps', trustedApps);

  if (trustedApps?.length === 0) return null;

  return (
    <>
      <Typography variant="h2" component="h1" sx={{ mt: 2 }}>
        {translate('app.page.apps')}
      </Typography>
      <Box mt={1}>
        <Grid container spacing={xs ? 1 : 3}>
          {trustedApps
            .filter(app => !appRegistrations.some(r => r['interop:registeredAgent'] === app.id))
            .map(app => (
              <ApplicationCard app={app} isTrustedApp isInstalled={false} />
            ))}
        </Grid>
      </Box>
    </>
  );
};

export default AvailableApps;
