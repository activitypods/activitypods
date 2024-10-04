import React from 'react';
import { Grid, useMediaQuery } from '@mui/material';
import StickyBox from './StickyBox';

const SplitView = ({ asides, children }) => {
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });
  if (xs || !asides) {
    return children;
  } else {
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
  }
};

export default SplitView;
