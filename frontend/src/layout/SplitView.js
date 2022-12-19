import React from 'react';
import { Grid, Hidden } from '@material-ui/core';
import StickyBox from "./StickyBox";

const SplitView = ({ aside, children }) => (
  <Grid container spacing={3}>
    <Grid item xs={12} md={aside ? 8 : 12} lg={aside ? 9 : 12}>
      {children}
    </Grid>
    {aside &&
      <Hidden smDown>
        <Grid item md={4} lg={3}>
          <StickyBox>
            {aside}
          </StickyBox>
        </Grid>
      </Hidden>
    }
  </Grid>
);

export default SplitView;
