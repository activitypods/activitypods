import React from 'react';
import { CreateButton, useListContext } from 'react-admin';
import { Box, Typography, Grid } from '@mui/material';
import SplitView from './SplitView';

const ListView = ({ asides, actions = [<CreateButton />], title, children }: any) => {
  const { defaultTitle } = useListContext();
  return (
    <SplitView asides={asides}>
      <Grid container sx={{ mt: 2 }}>
        <Grid item xs={8} sm={7}>
          <Typography variant="h2" component="h1" noWrap>
            {title || defaultTitle}
          </Typography>
        </Grid>
        <Grid item xs={4} sm={5}>
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
