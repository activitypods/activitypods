import React from 'react';
import { CreateButton, useListContext } from 'react-admin';
import { Box, Typography, Grid } from '@mui/material';
import SplitView from './SplitView';

const ListView = ({ asides, actions = [<CreateButton />], title, children }: any) => {
  return (
    <SplitView asides={asides}>
      <Grid container sx={{ mt: 2 }}>
        <Grid
          size={{
            xs: 8,
            sm: 7
          }}
        >
          <Typography variant="h2" component="h1" noWrap>
            {title}
          </Typography>
        </Grid>
        <Grid
          size={{
            xs: 4,
            sm: 5
          }}
        >
          <Box display="flex" alignItems="middle" justifyContent="right">
            {actions.map((action: any, key: any) => React.cloneElement(action, { key, color: 'black' }))}
          </Box>
        </Grid>
      </Grid>
      {children}
    </SplitView>
  );
};

export default ListView;
