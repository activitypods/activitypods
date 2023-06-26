import React from 'react';
import { Grid, Hidden } from '@material-ui/core';
import StickyBox from './StickyBox';

const SplitView = ({ asides, children }) => (
  <Grid container spacing={3}>
    <Grid item xs={12} md={asides ? 8 : 12} lg={asides ? 9 : 12}>
      {children}
    </Grid>
    {asides && (
      <Hidden smDown>
        <Grid item md={4} lg={3}>
          <StickyBox>{asides.map((aside, i) => React.cloneElement(aside, { key: i }))}</StickyBox>
        </Grid>
      </Hidden>
    )}
  </Grid>
);

export default SplitView;
