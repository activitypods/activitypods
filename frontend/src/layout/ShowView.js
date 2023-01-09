import React from 'react';
import { ListButton, EditButton, useShowContext } from 'react-admin';
import { Box, Typography, Grid } from '@material-ui/core';
import SplitView from "./SplitView";

const ShowView = (props) => {
  const { record } = useShowContext(props);
  return(
    <SplitView asides={props.asides}>
      <Grid container>
        <Grid item xs={8}>
          <Typography variant="h2" component="h1">
            {React.cloneElement(props.title, { record })}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Box display="flex" alignItems="middle" justifyContent="right">
            {props.actions.map((action, i) => React.cloneElement(action, { record, color: 'secondary', key: i }))}
          </Box>
        </Grid>
      </Grid>
      <Box mt={1}>
        {props.children}
      </Box>
    </SplitView>
  )
};

ShowView.defaultProps = {
  actions: [
    <ListButton />,
    <EditButton />
  ]
};

export default ShowView;
