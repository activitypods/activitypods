import React, { useMemo, useCallback } from 'react';
import { useCreatePath, useTranslate } from 'react-admin';
import { Box, Card, Typography, Avatar, Button } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { Link } from 'react-router-dom';
import { useCollection } from '@semapps/activitypub-components';
import AddContactButton from '../buttons/AddContactButton';
import RemoveContactButton from '../buttons/RemoveContactButton';
import AcceptContactRequestButton from '../buttons/AcceptContactRequestButton';
import RejectContactRequestButton from '../buttons/RejectContactRequestButton';
import IgnoreContactRequestButton from '../buttons/IgnoreContactRequestButton';
import IgnoreContactButton from '../buttons/IgnoreContactButton';

const useStyles = makeStyles(theme => ({
  root: {
    marginTop: 5,
    marginBottom: 24
  },
  title: {
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 14em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    color: theme.palette.primary.contrastText,
    height: 85,
    position: 'relative'
  },
  avatarWrapper: {
    position: 'absolute',
    margin: 10,
    top: 0,
    left: 0,
    right: 0,
    textAlign: 'center'
  },
  avatar: {
    width: 150,
    height: 150
  },
  block: {
    backgroundColor: 'white',
    paddingTop: 80,
    paddingBottom: 20
  },
  button: {
    backgroundColor: 'white',
    textAlign: 'center',
    '& a': {
      textDecoration: 'none'
    },
    '& button': {
      marginBottom: 8
    },
    '& button:last-of-type': {
      marginBottom: 0
    }
  }
}));

const ContactCard = ({ actor, publicProfileOnly }) => {
  const classes = useStyles();
  const createPath = useCreatePath();
  const translate = useTranslate();
  const { items: contacts, refetch: refetchContacts } = useCollection('apods:contacts');
  const { items: contactRequests, refetch: refetchRequests } = useCollection('apods:contactRequests');

  const contactRequest = useMemo(
    () => contactRequests?.find(activity => activity.actor === actor.id),
    [contactRequests, actor]
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchContacts(), refetchRequests()]);
  }, [refetchContacts, refetchRequests]);

  return (
    <Card className={classes.root}>
      <Box className={classes.title}>
        <Box display="flex" justifyContent="center" className={classes.avatarWrapper}>
          <Avatar 
            src={actor.image} 
            className={classes.avatar}
            aria-label={translate('app.user.profile_picture', { name: actor.name })}
          />
        </Box>
      </Box>
      <Box className={classes.block}>
        <Typography variant="h2" align="center">
          {actor.name}
        </Typography>
        <Typography align="center">{actor.webfinger}</Typography>
      </Box>
      <Box className={classes.button} pb={3} pr={3} pl={3}>
        {!actor.isLoggedUser &&
          (contacts?.includes(actor.id) ? (
            <RemoveContactButton refetch={refetchContacts} variant="contained" color="secondary" fullWidth />
          ) : (
            <AddContactButton refetch={refetchContacts} variant="contained" color="secondary" fullWidth />
          ))}
        {contactRequest && (
          <>
            <AcceptContactRequestButton
              activity={contactRequest}
              refetch={refetchAll}
              variant="contained"
              color="primary"
              fullWidth
            />
            {contactRequest.context ? (
              <IgnoreContactRequestButton
                activity={contactRequest}
                refetch={refetchAll}
                variant="contained"
                color="grey"
                fullWidth
              />
            ) : (
              <RejectContactRequestButton
                activity={contactRequest}
                refetch={refetchAll}
                variant="contained"
                color="grey"
                fullWidth
              />
            )}
          </>
        )}
        {!actor.isLoggedUser && !contactRequest && (
          <IgnoreContactButton variant="contained" color="primary" fullWidth />
        )}
        {actor.isLoggedUser && (
          <Link to={publicProfileOnly ? '/settings/profiles/public' : '/settings/profiles/private'}>
            <Button variant="contained" color="secondary" type="submit">
              {translate('app.action.edit_profile')}
            </Button>
          </Link>
        )}
      </Box>
    </Card>
  );
};

export default ContactCard;
