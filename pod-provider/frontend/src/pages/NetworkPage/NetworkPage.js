import React from 'react';
import { Button, useTranslate, useListContext } from 'react-admin';
import { Link } from 'react-router-dom';
import { Avatar, Box, Typography, Paper } from '@mui/material';
import Header from '../../common/Header';
import AddIcon from '@mui/icons-material/Add';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import List from '../../layout/List';
import ProfileCard from '../../common/cards/ProfileCard';
import ShareContactCard from '../../common/cards/ShareContactCard';
import TagsButton from '../../common/buttons/TagsButton';
import ContactRequestsBlock from '../../common/blocks/ContactRequestsBlock';
import { formatUsername } from '../../utils';

const ContactCard = ({ record }) => {
  const translate = useTranslate();
  const name = record['vcard:given-name'] || 'Unknown';
  const initial = name.toUpperCase()[0];
  const webfingerId = formatUsername(record.describes);

  return (
    <Paper
      component={Link}
      to={`/network/${webfingerId}`}
      elevation={0}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        p: 2,
        borderRadius: '12px',
        border: '1px solid rgba(0,0,0,0.07)',
        backgroundColor: '#fff',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
        '&:hover': {
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          borderColor: 'rgba(91,87,229,0.25)'
        }
      }}
      aria-label={translate('app.action.view_contact_profile', { name })}
    >
      <Avatar
        src={record['vcard:photo']}
        alt={translate('app.accessibility.profile_picture_of', { name })}
        sx={{ width: 52, height: 52, mb: 1, fontSize: 20 }}
      >
        {initial}
      </Avatar>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: '#1a1a1a',
          textAlign: 'center',
          lineHeight: 1.3,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {name}
      </Typography>
      {webfingerId && (
        <Typography sx={{ fontSize: 11, color: '#999', mt: 0.25 }}>
          {webfingerId.replace(/^@/, '').split('@')[0]}
        </Typography>
      )}
    </Paper>
  );
};

const ContactGrid = () => {
  const { data } = useListContext();
  if (!data || data.length === 0) return null;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        gap: 1.5,
        mt: 1
      }}
    >
      {data.map(record => (
        <ContactCard key={record.id} record={record} />
      ))}
    </Box>
  );
};

const NetworkPage = () => {
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
          <Button to="/network/request" component={Link} label="app.action.send_request" startIcon={<AddIcon />} />,
          <TagsButton />
        ]}
        asides={[<ProfileCard />, <ShareContactCard />]}
        sort={{ field: 'vcard:given-name', order: 'ASC' }}
        perPage={1000}
      >
        <ContactRequestsBlock />
        <ContactGrid />
      </List>
    </>
  );
};

export default NetworkPage;
