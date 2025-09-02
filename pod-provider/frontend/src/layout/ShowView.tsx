import React from 'react';
import { ListButton, EditButton, useShowContext, usePermissions, useRecordContext } from 'react-admin';
import { Box, Typography, Grid } from '@mui/material';
import SplitView from './SplitView';

const ShowView = ({ asides, title, actions, children }: any) => {
  const record = useRecordContext();
  const { permissions } = usePermissions(record?.id);
  return (
    <SplitView asides={asides}>
      <Grid container sx={{ mt: 2 }}>
        <Grid size={8}>
          <Typography variant="h2" component="h1" noWrap>
            {title}
          </Typography>
        </Grid>
        <Grid size={4}>
          <Box display="flex" alignItems="middle" justifyContent="right">
            {actions ? (
              actions.map((action: any, i: any) => React.cloneElement(action, { color: 'black', key: i }))
            ) : (
              <>
                <ListButton
                  // @ts-expect-error TS(2322): Type '"black"' is not assignable to type '"inherit... Remove this comment to see the full error message
                  color="black"
                />
                {permissions && permissions.some((p: any) => p['acl:mode'] === 'acl:Write') && (
                  <EditButton
                    // @ts-expect-error TS(2322): Type '"black"' is not assignable to type '"inherit... Remove this comment to see the full error message
                    color="black"
                  />
                )}
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
