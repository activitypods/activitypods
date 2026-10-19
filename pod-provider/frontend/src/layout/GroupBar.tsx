import React from 'react';
import { Box, Container, Avatar, Typography } from '@mui/material';
import useRealmContext from '../hooks/useRealmContext';

const GroupBar = () => {
  const { isGroup, data: group } = useRealmContext() as any;
  if (!isGroup || !group) return null;

  return (
    <Box sx={{ backgroundColor: 'white' }}>
      <Container>
        <Box display="flex" alignItems="center" py={0.5}>
          <Avatar src={group.avatar} sx={{ width: 20, height: 20, mr: 1, fontSize: 12 }}>
            {group.fullName?.[0]}
          </Avatar>
          <Typography noWrap variant="body2">
            {group.fullName}
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default GroupBar;
