import React from 'react';
import { useTranslate, SimpleList } from 'react-admin';
import { Link } from 'react-router-dom';
import { Avatar, Button } from '@mui/material';
import Header from '../../common/Header';
import AddIcon from '@mui/icons-material/Add';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import List from '../../layout/List';
import ProfileCard from '../../common/cards/ProfileCard';
import ShareContactCard from '../../common/cards/ShareContactCard';
import TagsButton from '../../common/buttons/TagsButton';
import ContactRequestsBlock from '../../common/blocks/ContactRequestsBlock';
import { formatUsername } from '../../utils';

const NetworkPage = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  const { identity } = useCheckAuthenticated();
  const translate = useTranslate();
  if (!identity?.id) return null;
  return (
    <>
      <Header title="app.titles.network" />
      <List
        resource="Profile"
        title={translate('app.page.contacts')}
        actions={[
          <Link to="/network/request">
            <Button startIcon={<AddIcon />}>{translate('app.action.send_request')}</Button>
          </Link>,
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
            <Avatar
              src={record['vcard:photo']}
              alt={translate('app.accessibility.profile_picture_of', { name: record['vcard:given-name'] })}
              aria-label={translate('app.action.view_contact_profile', { name: record['vcard:given-name'] })}
            >
              {record['vcard:given-name']?.toUpperCase()?.[0]}
            </Avatar>
          )}
          rowClick={id => `/network/${formatUsername(id as string)}`}
          rowSx={() => ({
            backgroundColor: 'white',
            p: 1,
            mb: 1,
            boxShadow:
              '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)'
          })}
        />
      </List>
    </>
  );
};

export default NetworkPage;
