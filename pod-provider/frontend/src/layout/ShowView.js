import React from 'react';
import { ListButton, EditButton, useShowContext, usePermissions } from 'react-admin';
import { Box, Typography, Grid } from '@mui/material';
import SplitView from './SplitView';

const ShowView = ({ asides, title, actions, children }) => {
  const { record } = useShowContext();
  const { permissions } = usePermissions(record?.id);
  return (
    <SplitView asides={asides}>
      <Grid container sx={{ mt: 2 }}>
        <Grid item xs={8}>
          <Typography variant="h2" component="h1" noWrap>
            {title}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Box display="flex" alignItems="middle" justifyContent="right">
            {actions ? (
              actions.map((action, i) => React.cloneElement(action, { color: 'black', key: i }))
            ) : (
              <>
                <ListButton color="black" />
                {permissions && permissions.some(p => p['acl:mode'] === 'acl:Write') && <EditButton color="black" />}
              </>
            )}
          </Box>
        </Grid>
      </Grid>
      <Box mt={1} mb={3}>
        {children}
      </Box>
    </SplitView>
  );
};

export default ShowView;
