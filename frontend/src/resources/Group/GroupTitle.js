import React from 'react';
import { useRecordContext } from 'react-admin';

const GroupTitle = () => {
  const record = useRecordContext();
  return <span>{record ? record['vcard:label'] : ''}</span>;
};

export default GroupTitle;
