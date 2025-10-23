import React from 'react';
import { ListButton } from 'react-admin';
import Edit from '../../layout/Edit';
import TagForm from './TagForm';
import BlockAnonymous from '../../common/BlockAnonymous';

export const TagEdit = () => (
  <BlockAnonymous>
    <Edit actions={[<ListButton />]}>
      <TagForm />
    </Edit>
  </BlockAnonymous>
);

export default TagEdit;
