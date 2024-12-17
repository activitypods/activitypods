import React from 'react';
import { Button, useTranslate, SimpleList } from 'react-admin';
import { Link } from 'react-router-dom';
import { Avatar } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import List from '../../layout/List';
import ProfileCard from '../../common/cards/ProfileCard';
import ShareContactCard from '../../common/cards/ShareContactCard';
import TagsButton from '../../common/buttons/TagsButton';
import ContactRequestsBlock from '../../common/blocks/ContactRequestsBlock';
import { formatUsername } from '../../utils';

const NetworkPage = () => {
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  if (!identity?.id) return null;
  return (
    <List
      resource="Profile"
      title={translate('app.page.contacts')}
      actions={[
        <Button component={Link} to="/network/request" label="app.action.send_request">
          <AddIcon />
        </Button>,
        <TagsButton />
      ]}
      asides={[<ProfileCard />, <ShareContactCard />]}
      sort={{ field: 'vcard:given-name', order: 'ASC' }}
      perPage={1000}
    >
      <ContactRequestsBlock />
      <SimpleList
        primaryText={record => record['vcard:given-name']}
        secondaryText={record => formatUsername(record.describes)}
        leftAvatar={record => (
          <Avatar src={record['vcard:photo']}>{record['vcard:given-name']?.toUpperCase()?.[0]}</Avatar>
        )}
        linkType={record => `/network/${formatUsername(record.describes)}`}
        rowSx={() => ({
          backgroundColor: 'white',
          p: 1,
          mb: 1,
          boxShadow:
            '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)'
        })}
      />
    </List>
  );
};

export default NetworkPage;
