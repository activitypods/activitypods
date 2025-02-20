import React from 'react';
import { Grid, useMediaQuery, Box } from '@mui/material';
import StickyBox from './StickyBox';

const SplitView = ({ asides, children }) => {
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });
  if (!asides) {
    return children;
  }
  
  if (xs) {
    return (
      <Grid container spacing={2}>
        <Grid item xs={12}>
          {children}
        </Grid>
        <Grid item xs={12} sx={{ mt: 1 }}>
          {asides.map((aside, i) => (
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
      <Grid item xs={12} md={8} lg={9}>
        {children}
      </Grid>
      <Grid item mt={2} md={4} lg={3}>
        <StickyBox>{asides.map((aside, i) => React.cloneElement(aside, { key: i }))}</StickyBox>
      </Grid>
    </Grid>
  );
};

export default SplitView;
