import React from 'react';
import { useTranslate, SimpleList, TextField } from 'react-admin';
import { Avatar } from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import List from '../../layout/List';
import { arrayFromLdField } from '../../utils';

const GroupList = () => {
  const translate = useTranslate();
  return (
    <List>
      <SimpleList
        primaryText={<TextField source="vcard:label" />}
        secondaryText={(record) =>
          `${translate('app.group.members')}: ${arrayFromLdField(record['vcard:hasMember']).length}`
        }
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
            '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)',
        })}
      />
    </List>
  );
};

export default GroupList;
