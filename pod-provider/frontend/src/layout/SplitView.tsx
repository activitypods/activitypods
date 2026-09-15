import React from 'react';
import { Grid, useMediaQuery, Box } from '@mui/material';
import StickyBox from './StickyBox';

const SplitView = ({ asides, children }: any) => {
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });
  if (!asides) {
    return children;
  }

  if (xs) {
    return (
      <Grid container spacing={2}>
        <Grid size={12}>{children}</Grid>
        <Grid sx={{ mt: 1 }} size={12}>
          {asides.map((aside: any, i: any) => (
            <Box key={i} sx={{ mb: i < asides.length - 1 ? 2 : 0 }}>
              {React.cloneElement(aside)}
            </Box>
          ))}
        </Grid>
      </Grid>
    );
  }

  return (
    <Grid container spacing={3}>
      <Grid
        size={{
          xs: 12,
          md: 8,
          lg: 9
        }}
      >
        {children}
      </Grid>
      <Grid
        mt={2}
        size={{
          md: 4,
          lg: 3
        }}
      >
        <StickyBox>{asides.map((aside: any, i: any) => React.cloneElement(aside, { key: i }))}</StickyBox>
      </Grid>
    </Grid>
  );
};

export default SplitView;
