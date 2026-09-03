import React from 'react';
import { Avatar } from '@mui/material';
import { useRecordContext } from 'react-admin';

const AvatarField = ({ source, ...rest }: any) => {
  const record = useRecordContext();
  if (!record) return null;
  return <Avatar src={record[source]} {...rest} />;
};

export default AvatarField;
