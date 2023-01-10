import React from 'react';
import { ListButton, EditButton, useShowContext, usePermissionsOptimized } from 'react-admin';
import { Box, Typography, Grid } from '@material-ui/core';
import SplitView from "./SplitView";

const ShowView = (props) => {
  const { record } = useShowContext(props);
  const { permissions } = usePermissionsOptimized(record?.id);
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
            {props.actions
              ? props.actions.map((action, i) => React.cloneElement(action, { record, color: 'secondary', key: i }))
              : <>
                  <ListButton color="secondary" />
                  {permissions && permissions.some(p => p['acl:mode'] === 'acl:Write') && <EditButton color="secondary" />}
                </>
            }
          </Box>
        </Grid>
      </Grid>
      <Box mt={1}>
        {props.children}
      </Box>
    </SplitView>
  )
};

export default ShowView;
