import React from 'react';
import { ListButton } from 'react-admin';
import Edit from '../../layout/Edit';
import GroupForm from './GroupForm';
import GroupTitle from './GroupTitle';
import BlockAnonymous from '../../common/BlockAnonymous';

export const GroupEdit = (props) => (
  <BlockAnonymous>
    <Edit title={<GroupTitle />} actions={[<ListButton />]} {...props}>
      <GroupForm />
    </Edit>
  </BlockAnonymous>
);

export default GroupEdit;
