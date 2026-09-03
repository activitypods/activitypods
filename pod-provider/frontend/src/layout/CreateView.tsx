import React from 'react';
import { ListButton, useCreateContext } from 'react-admin';
import { Box, Typography, Grid, Card } from '@mui/material';

const CreateView = ({ actions = [<ListButton />], children }: any) => {
  const { defaultTitle } = useCreateContext();
  return (
    <>
      <Grid container sx={{ mt: 2 }}>
        <Grid size={8}>
          <Typography variant="h2" component="h1" noWrap>
            {defaultTitle}
          </Typography>
        </Grid>
        <Grid size={4}>
          <Box display="flex" alignItems="middle" justifyContent="right">
            <>{/* @ts-expect-error TS(7006): Parameter 'action' implicitly has an 'any' type. */}</>
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

export default CreateView;
