import React from 'react';
import { ListButton } from 'react-admin';
import Edit from '../../layout/Edit';
import GroupForm from './GroupForm';
import BlockAnonymous from '../../common/BlockAnonymous';

export const GroupEdit = (props) => {
  const { record } = props;
  return (
    <BlockAnonymous>
      <Edit title={<span>{record ? record['vcard:label'] : ''}</span>} actions={[<ListButton />]} {...props}>
        <GroupForm />
      </Edit>
    </BlockAnonymous>
  );
};

export default GroupEdit;
