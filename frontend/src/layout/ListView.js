import React from 'react';
import { CreateButton, useListContext } from 'react-admin';
import { Box, Typography, Grid } from '@material-ui/core';

const ListView = (props) => {
  const { defaultTitle, hasCreate } = useListContext(props);
  return(
    <>
      <Grid container>
        <Grid item xs={8}>
          <Typography variant="h3" color="primary" component="h1">
            {defaultTitle}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Box display="flex" alignItems="middle" justifyContent="right" pt={3}>
            {hasCreate && <CreateButton />}
          </Box>
        </Grid>
      </Grid>
      <Box mt={1}>
        {props.children}
      </Box>
    </>
  )
};

export default ListView;
