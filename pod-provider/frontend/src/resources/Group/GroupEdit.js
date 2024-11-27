import React from 'react';
import { ListButton } from 'react-admin';
import Edit from '../../layout/Edit';
import GroupForm from './GroupForm';
import BlockAnonymous from '../../common/BlockAnonymous';

export const GroupEdit = () => (
  <BlockAnonymous>
    <Edit actions={[<ListButton />]}>
      <GroupForm />
    </Edit>
  </BlockAnonymous>
);

export default GroupEdit;
