import React from 'react';
import { ListButton } from 'react-admin';
import Edit from '../../layout/Edit';
import GroupForm from './GroupForm';
import BlockAnonymous from '../../common/BlockAnonymous';
import GroupTitle from './GroupTitle';

export const GroupEdit = () => (
  <BlockAnonymous>
    <Edit title={<GroupTitle />} actions={[<ListButton />]}>
      <GroupForm />
    </Edit>
  </BlockAnonymous>
);

export default GroupEdit;
