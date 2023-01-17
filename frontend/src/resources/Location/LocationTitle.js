import React from 'react';

const ProfileTitle = ({ record }) => {
  return <span>{record ? record['vcard:given-name'] : ''}</span>;
};

export default ProfileTitle;
