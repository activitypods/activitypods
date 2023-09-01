import React from 'react';
import { ListButton, ShowButton } from 'react-admin';
import { Box, Typography, Grid, Card } from '@mui/material';

const EditView = ({ title, actions, children }) => (
  <>
    <Grid container sx={{ mt: 2 }}>
      <Grid item xs={8}>
        <Typography variant="h2" component="h1">
          {title}
        </Typography>
      </Grid>
      <Grid item xs={4}>
        <Box display="flex" alignItems="middle" justifyContent="right">
          {actions.map((action, key) => React.cloneElement(action, { key, color: 'primary' }))}
        </Box>
      </Grid>
    </Grid>
    <Box mt={1}>
      <Card>
        {children}
      </Card>
    </Box>
  </>
);

EditView.defaultProps = {
  actions: [
    <ListButton />,
    <ShowButton />
  ]
};

export default EditView;
