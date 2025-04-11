import React from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import Create from '../../layout/Create';
import TagForm from './TagForm';

export const TagCreate = (props: any) => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  const { identity } = useCheckAuthenticated();
  if (!identity) return null;
  return (
    <Create {...props}>
      <TagForm />
    </Create>
  );
};

export default TagCreate;
