import React from 'react';
import { useRecordContext } from 'react-admin';

const ProfileTitle = () => {
  const record = useRecordContext();
  return <span>{record ? record['vcard:given-name'] : ''}</span>;
};

export default ProfileTitle;
