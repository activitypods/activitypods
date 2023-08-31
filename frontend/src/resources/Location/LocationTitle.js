import React from 'react';
import { useRecordContext } from 'react-admin';

const LocationTitle = () => {
  const record = useRecordContext();
  return <span>{record ? record['vcard:given-name'] : ''}</span>;
};

export default LocationTitle;
