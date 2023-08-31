import React from 'react';
import { CreateButton, useTranslate, SimpleList } from 'react-admin';
import { Avatar } from "@mui/material";
import { useCheckAuthenticated } from '@semapps/auth-provider';
import List from "../../layout/List";
import ProfileCard from "../../common/cards/ProfileCard";
import ShareContactCard from "../../common/cards/ShareContactCard";
import { formatUsername } from "../../utils";
import ContactRequestsBlock from "../../common/blocks/ContactRequestsBlock";

const ProfileList = (props) => {
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  if (!identity?.id) return null;
  return (
    <List
      title={translate('app.page.contacts')}
      actions={[<CreateButton label="app.action.add_contact" />]}
      asides={[<ProfileCard />, <ShareContactCard />]}
      sort={{ field: 'vcard:given-name', order: 'ASC' }}
      perPage={1000}
      {...props}
    >
      {/* <ContactRequestsBlock /> */}
      <SimpleList
        primaryText={record => record['vcard:given-name']}
        secondaryText={record => formatUsername(record.describes)}
        leftAvatar={record => (<Avatar src={record['vcard:photo']}>{record['vcard:given-name']?.toUpperCase()?.[0]}</Avatar>)}
        linkType="show"
        rowStyle={(record, index) => ({
          backgroundColor: 'white',
          padding: 8,
          marginBottom: 8,
          boxShadow: '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)',
        })}
      />
    </List>
  );
}

export default ProfileList;
