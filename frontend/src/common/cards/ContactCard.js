import React, { useMemo, useCallback } from 'react';
import { Box, Card, Typography, Avatar } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { TextField, ReferenceField, useRecordContext } from 'react-admin';
import { useCollection } from '@semapps/activitypub-components';
import { formatUsername } from '../../utils';
import RemoveContactButton from '../buttons/RemoveContactButton';
import AcceptContactRequestButton from '../buttons/AcceptContactRequestButton';
import RejectContactRequestButton from '../buttons/RejectContactRequestButton';
import IgnoreContactRequestButton from '../buttons/IgnoreContactRequestButton';
import IgnoreContactButton from '../buttons/IgnoreContactButton';
import AvatarField from '../fields/AvatarField';

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

const ContactCard = () => {
  const classes = useStyles();
  const record = useRecordContext();
  const { items: contacts, refetch: refetchContacts } = useCollection('apods:contacts');
  const { items: contactRequests, refetch: refetchRequests } = useCollection('apods:contactRequests');

  const contactRequest = useMemo(
    () => contactRequests?.find(activity => record && activity.actor === record.id),
    [contactRequests, record]
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchContacts(), refetchRequests()]);
  }, [refetchContacts, refetchRequests]);

  if (!record) return null;

  return (
    <Card className={classes.root}>
      <Box className={classes.title}>
        <Box display="flex" justifyContent="center" className={classes.avatarWrapper}>
          <ReferenceField source="url" reference="Profile" link={false}>
            <AvatarField source="vcard:photo" className={classes.avatar} />
          </ReferenceField>
        </Box>
      </Box>
      <Box className={classes.block}>
        <ReferenceField source="url" reference="Profile" link={false}>
          <TextField source="vcard:given-name" component="p" variant="h2" align="center" />
        </ReferenceField>
        <Typography align="center">{formatUsername(record.id)}</Typography>
      </Box>
      {(contacts?.includes(record.id) || contactRequest) && (
        <Box className={classes.button} pb={3} pr={3} pl={3}>
          {contacts?.includes(record.id) && (
            <RemoveContactButton refetch={refetchContacts} variant="contained" color="secondary" fullWidth />
          )}
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
          {!contactRequest && <IgnoreContactButton variant="contained" color="primary" fullWidth />}
        </Box>
      )}
    </Card>
  );
};

export default ContactCard;
