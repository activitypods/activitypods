import React, { useCallback } from 'react';
import { useCreatePath, useTranslate, Link, useRefresh, useGetOne } from 'react-admin';
import { Card, Avatar, Grid, Typography, Box, useMediaQuery } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { useCollection } from '@semapps/activitypub-components';
import { formatUsername } from '../../utils';
import AcceptContactRequestButton from '../buttons/AcceptContactRequestButton';
import IgnoreContactRequestButton from '../buttons/IgnoreContactRequestButton';
import RejectContactRequestButton from '../buttons/RejectContactRequestButton';

const useStyles = makeStyles(theme => ({
  root: {
    marginTop: 5,
    marginBottom: 24,
    [theme.breakpoints.down('sm')]: {
      marginBottom: 0
    }
  },
  title: {
    borderBottom: '1px lightgrey solid',
    padding: 12
  },
  list: {
    padding: 4,
    paddingLeft: 60,
    position: 'relative'
  },
  name: {
    fontWeight: 'bold',
    lineHeight: 2,
    marginRight: 6,
    color: 'black'
  },
  avatar: {
    width: 42,
    height: 42,
    left: 5,
    top: 12,
    position: 'absolute'
  },
  button: {
    margin: 6,
    [theme.breakpoints.down('sm')]: {
      margin: 0,
      marginRight: 6,
      height: 30,
      minWidth: 90
    }
  }
}));

const ContactRequest = ({ activity, refetch }) => {
  const classes = useStyles();
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });
  const createPath = useCreatePath();
  const translate = useTranslate();

  let { data: profile, isLoading } = useGetOne('Profile', { id: activity.object.object });

  if (isLoading) return null;

  const message = activity.content || (activity.context ? translate('app.message.you_participated_to_same_event') : '');

  return (
    <>
      <Link to={createPath({ resource: 'Profile', id: activity.object.object, type: 'show' })}>
        <Avatar src={profile?.['vcard:photo']} className={classes.avatar} />
      </Link>
      <Grid container spacing={xs ? 2 : 2}>
        <Grid item xs={12} sm={8}>
          <div>
            <Link to={createPath({ resource: 'Profile', id: activity.object.object, type: 'show' })}>
              <Typography variant="body1" className={classes.name} component="span">
                {profile?.['vcard:given-name']}
              </Typography>
            </Link>
            <Typography variant="subtitle1" component="span">
              {profile && formatUsername(profile.describes)}
            </Typography>
          </div>
          <Typography variant="body2">{message}</Typography>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Box display="flex" alignItems="middle" justifyContent={xs ? 'flex-start' : 'flex-end'}>
            <AcceptContactRequestButton
              activity={activity}
              refetch={refetch}
              variant="contained"
              color="primary"
              className={classes.button}
            >
              {translate('app.action.accept')}
            </AcceptContactRequestButton>
            {activity.context ? (
              <IgnoreContactRequestButton
                activity={activity}
                refetch={refetch}
                variant="contained"
                color="grey"
                className={classes.button}
              >
                {translate('app.action.ignore')}
              </IgnoreContactRequestButton>
            ) : (
              <RejectContactRequestButton
                activity={activity}
                refetch={refetch}
                variant="contained"
                color="grey"
                className={classes.button}
              >
                {translate('app.action.reject')}
              </RejectContactRequestButton>
            )}
          </Box>
        </Grid>
      </Grid>
    </>
  );
};

const ContactRequestsBlock = () => {
  const classes = useStyles();
  const translate = useTranslate();
  const refresh = useRefresh();
  const { items: contactRequests, refetch } = useCollection('apods:contactRequests');

  const refetchAndRefresh = useCallback(async () => {
    await refetch();
    refresh();
  }, [refetch, refresh]);

  if (contactRequests.length === 0) return null;

  return (
    <Card className={classes.root}>
      <Box className={classes.title}>
        <Typography variant="body2">{translate('app.block.contact_requests')}</Typography>
      </Box>
      <Box p={1} pt={0}>
        {contactRequests.map(activity => (
          <Box className={classes.list} key={activity.id}>
            <ContactRequest activity={activity} refetch={refetchAndRefresh} />
          </Box>
        ))}
      </Box>
    </Card>
  );
};

export default ContactRequestsBlock;
