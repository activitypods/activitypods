import React from 'react';
import { SimpleList } from 'react-admin';
import List from "../../layout/List";

const ProfileList = (props) => (
  <List {...props}>
    <SimpleList
      linkType="show"
      primaryText={record => record['vcard:given-name']}
    />
  </List>
);

export default ProfileList;
