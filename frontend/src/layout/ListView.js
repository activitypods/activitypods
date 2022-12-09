import React from 'react';
import { CreateButton, useListContext } from 'react-admin';
import { Box, Typography, Grid } from '@material-ui/core';
import SplitView from "./SplitView";

const ListView = (props) => {
  const { defaultTitle, hasCreate } = useListContext(props);
  return(
    <SplitView aside={props.aside}>
      <Grid container>
        <Grid item xs={8}>
          <Typography variant="h2" component="h1">
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
    </SplitView>
  )
};

export default ListView;
