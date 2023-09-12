import React from 'react';
import { ListButton, useCreateContext } from 'react-admin';
import { Box, Typography, Grid, Card } from '@mui/material';

const CreateView = ({ actions, children }) => {
  const { defaultTitle } = useCreateContext();
  return (
    <>
      <Grid container sx={{ mt: 2 }}>
        <Grid item xs={8}>
          <Typography variant="h2" component="h1">
            {defaultTitle}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Box display="flex" alignItems="middle" justifyContent="right">
            {actions.map((action, i) => React.cloneElement(action, { color: 'black', key: i }))}
          </Box>
        </Grid>
      </Grid>
      <Box mt={1}>
        <Card>{children}</Card>
      </Box>
    </>
  );
};

CreateView.defaultProps = {
  actions: [<ListButton />],
};

export default CreateView;
