import React from 'react';
import { useQueryWithStore, Link, useTranslate, linkToRecord } from 'react-admin';
import {
  makeStyles,
  Card,
  Avatar,
  Typography,
  Box,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
} from '@material-ui/core';
import { useCollection } from '@semapps/activitypub-components';
import { formatUsername } from '../../utils';

const useStyles = makeStyles((theme) => ({
  root: {
    marginTop: 5,
    marginBottom: 24,
  },
  title: {
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 8em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    color: theme.palette.primary.contrastText,
    padding: '12px 16px',
    [theme.breakpoints.down('sm')]: {
      padding: '8px 16px',
    },
  },
  listItem: {
    padding: '4px 12px',
  },
  text: {
    color: 'black !important',
  },
}));

const ContactRequest = ({ activity }) => {
  const classes = useStyles();

  let { loading, data: profile } = useQueryWithStore({
    type: 'getOne',
    resource: 'Profile',
    payload: { id: activity.object.object },
  });

  if (loading) return null;

  return (
    <Link to={linkToRecord('/Profile', activity.object.object, 'show')}>
      <ListItem button className={classes.listItem}>
        <ListItemAvatar>
          <Avatar src={profile?.['vcard:photo']}>{profile?.['vcard:given-name']?.[0]}</Avatar>
        </ListItemAvatar>
        <ListItemText
          classes={{ primary: classes.text }}
          primary={profile?.['vcard:given-name']}
          secondary={profile && formatUsername(profile.describes)}
        />
      </ListItem>
    </Link>
  );
};

const ContactRequestsCard = () => {
  const classes = useStyles();
  let { items: contactRequests } = useCollection('apods:contactRequests');
  const translate = useTranslate();

  if (contactRequests.length === 0) return null;

  return (
    <Card className={classes.root}>
      <Box className={classes.title} p={2}>
        <Typography variant="h6">{translate('app.card.contact_requests')}</Typography>
      </Box>
      {contactRequests.map((activity) => (
        <List>
          <ContactRequest activity={activity} />
        </List>
      ))}
    </Card>
  );
};

export default ContactRequestsCard;
