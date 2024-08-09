import React from 'react';
import { CreateButton, useListContext } from 'react-admin';
import { Box, Typography, Grid } from '@mui/material';
import SplitView from './SplitView';

const ListView = ({ asides, actions = [<CreateButton />], title, children }) => {
  const { defaultTitle } = useListContext();
  return (
    <SplitView asides={asides}>
      <Grid container sx={{ mt: 2 }}>
        <Grid item xs={8}>
          <Typography variant="h2" component="h1">
            {title || defaultTitle}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Box display="flex" alignItems="middle" justifyContent="right">
            {actions.map((action, key) => React.cloneElement(action, { key, color: 'black' }))}
          </Box>
        </Grid>
      </Grid>
      {children}
    </SplitView>
  );
};

export default ListView;
