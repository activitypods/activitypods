import React from 'react';
import { ListButton, EditButton, useShowContext, usePermissions } from 'react-admin';
import { Box, Typography, Grid } from '@mui/material';
import SplitView from './SplitView';

const ShowView = ({ asides, title, actions, children }) => {
  const { record } = useShowContext();
  const { permissions } = usePermissions(record?.id);
  return (
    <SplitView asides={asides}>
      <Grid container>
        <Grid item xs={8}>
          <Typography variant="h2" component="h1">
            {title}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Box display="flex" alignItems="middle" justifyContent="right">
            {actions ? (
              actions.map((action, i) => React.cloneElement(action, { color: 'primary', key: i }))
            ) : (
              <>
                <ListButton />
                {permissions && permissions.some((p) => p['acl:mode'] === 'acl:Write') && (
                  <EditButton />
                )}
              </>
            )}
          </Box>
        </Grid>
      </Grid>
      <Box mt={1}>{children}</Box>
    </SplitView>
  );
};

export default ShowView;
