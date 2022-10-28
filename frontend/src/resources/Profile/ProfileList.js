import React from 'react';
import { SimpleList } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import List from "../../layout/List";

const ProfileList = (props) => {
  const { identity } = useCheckAuthenticated();
  if (!identity?.id) return null;
  return (
    <List {...props}>
      <SimpleList
        linkType="show"
        primaryText={record => record['vcard:given-name']}
      />
    </List>
  );
};

export default ProfileList;
