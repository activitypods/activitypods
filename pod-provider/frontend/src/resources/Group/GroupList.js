import React from 'react';
import { useTranslate, SimpleList, TextField } from 'react-admin';
import { Avatar } from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import List from '../../layout/List';
import { arrayOf } from '../../utils';

const GroupList = () => {
  useCheckAuthenticated();
  const translate = useTranslate();
  return (
    <List title={translate('app.page.groups')}>
      <SimpleList
        primaryText={<TextField source="vcard:label" />}
        secondaryText={record => `${translate('app.group.members')}: ${arrayOf(record['vcard:hasMember']).length}`}
        linkType="edit"
        leftAvatar={() => (
          <Avatar>
            <GroupIcon />
          </Avatar>
        )}
        rowSx={(record, index) => ({
          backgroundColor: 'white',
          p: 1,
          pl: 2,
          mb: 1,
          boxShadow:
            '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)'
        })}
      />
    </List>
  );
};

export default GroupList;
