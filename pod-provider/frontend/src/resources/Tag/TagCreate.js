import React from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import Create from '../../layout/Create';
import TagForm from './TagForm';

export const TagCreate = props => {
  const { identity } = useCheckAuthenticated();
  if (!identity) return null;
  return (
    <Create {...props}>
      <TagForm />
    </Create>
  );
};

export default TagCreate;
