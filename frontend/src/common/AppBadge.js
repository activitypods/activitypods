import React from 'react';
import { useGetOne } from 'react-admin';
import { Badge, Avatar } from '@mui/material';

const AppBadge = ({ appUri, children }) => {
  const { data: app } = useGetOne('App', { id: appUri }, { enabled: !!appUri });
  if (!app) return children;
  return (
    <Badge
      overlap="circular"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      badgeContent={
        <Avatar
          alt={app['interop:applicationName']}
          src={app['interop:applicationThumbnail']}
          sx={{ width: 22, height: 22, bgcolor: 'white' }}
        />
      }
    >
      {children}
    </Badge>
  );
};

export default AppBadge;
