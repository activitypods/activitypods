import React from 'react';

const ProfileTitle = ({ record }) => {
  return <span>{record ? record['vcard:label'] : ''}</span>;
};

export default ProfileTitle;
