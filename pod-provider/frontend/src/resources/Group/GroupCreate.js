import React from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import Create from '../../layout/Create';
import GroupForm from './GroupForm';

export const GroupCreate = props => {
  const { identity } = useCheckAuthenticated();
  if (!identity) return null;
  return (
    <Create {...props}>
      <GroupForm />
    </Create>
  );
};

export default GroupCreate;
