import React from 'react';
import { ListButton, ShowButton, RecordRepresentation } from 'react-admin';
import { Box, Typography, Grid, Card } from '@mui/material';

const EditView = ({ title, actions = [<ListButton />, <ShowButton />], children }: any) => (
  <>
    <Grid container sx={{ mt: 2 }}>
      <Grid item xs={8}>
        <Typography variant="h2" component="h1" noWrap>
          {title || <RecordRepresentation />}
        </Typography>
      </Grid>
      <Grid item xs={4}>
        <Box display="flex" alignItems="middle" justifyContent="right">
          {actions.map((action: any, key: any) => React.cloneElement(action, { key, color: 'black' }))}
        </Box>
      </Grid>
    </Grid>
    <Box mt={1}>
      <Card>{children}</Card>
    </Box>
  </>
);

export default EditView;
