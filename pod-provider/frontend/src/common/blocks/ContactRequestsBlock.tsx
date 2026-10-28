import React, { useCallback } from 'react';
import { useCreatePath, useTranslate, Link, useRefresh, useGetOne } from 'react-admin';
import { Card, Avatar, Grid, Typography, Box, useMediaQuery } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useCollection } from '@semapps/activitypub-components';
import { formatUsername } from '../../utils';
import AcceptContactRequestButton from '../buttons/AcceptContactRequestButton';
import IgnoreContactRequestButton from '../buttons/IgnoreContactRequestButton';
import RejectContactRequestButton from '../buttons/RejectContactRequestButton';
import AnswerGroupInvitationButton from '../buttons/AnswerGroupInvitationButton';
import useActor from '../../hooks/useActor';

const useStyles = makeStyles()(theme => ({
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

const ContactRequest = ({ activity, refetch }: any) => {
  const { classes } = useStyles();
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });
  const createPath = useCreatePath();
  const translate = useTranslate();

  const { data: profile, isLoading } = useGetOne('Profile', { id: activity.object.object });

  if (isLoading) return null;

  const message = activity.content || (activity.context ? translate('app.message.you_participated_to_same_event') : '');

  return (
    <>
      <Link to={createPath({ resource: 'Profile', id: activity.object.object, type: 'show' })}>
        <Avatar src={profile?.['vcard:photo']} className={classes.avatar} />
      </Link>
      <Grid container spacing={xs ? 2 : 2}>
        <Grid size={{ xs: 12, sm: 8 }}>
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
        <Grid size={{ xs: 12, sm: 4 }}>
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
                color="secondary"
                className={classes.button}
              >
                {translate('app.action.ignore')}
              </IgnoreContactRequestButton>
            ) : (
              <RejectContactRequestButton
                activity={activity}
                refetch={refetch}
                variant="contained"
                color="secondary"
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

const GroupInvitation = ({ activity, refetch }: any) => {
  const { classes } = useStyles();
  const xs = useMediaQuery((theme: any) => theme.breakpoints.down('sm'), { noSsr: true });
  const translate = useTranslate();
  const group = useActor(activity.actor);

  if (group.isLoading) return null;

  return (
    <>
      <Link to={`/network/${group.webfinger}`}>
        <Avatar src={group.image} className={classes.avatar} />
      </Link>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 8 }}>
          <div>
            <Link to={`/network/${group.webfinger}`}>
              <Typography variant="body1" className={classes.name} component="span">
                {group.name}
              </Typography>
            </Link>
            <Typography variant="subtitle1" component="span">
              {group.webfinger}
            </Typography>
          </div>
          <Typography variant="body2">{translate('app.message.group_invitation')}</Typography>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Box display="flex" alignItems="middle" justifyContent={xs ? 'flex-start' : 'flex-end'}>
            <AnswerGroupInvitationButton
              activity={activity}
              accept
              refetch={refetch}
              variant="contained"
              color="primary"
              className={classes.button}
            >
              {translate('app.action.accept')}
            </AnswerGroupInvitationButton>
            <AnswerGroupInvitationButton
              activity={activity}
              accept={false}
              refetch={refetch}
              variant="contained"
              color="secondary"
              className={classes.button}
            >
              {translate('app.action.reject')}
            </AnswerGroupInvitationButton>
          </Box>
        </Grid>
      </Grid>
    </>
  );
};

const ContactRequestsBlock = () => {
  const { classes } = useStyles();
  const translate = useTranslate();
  const refresh = useRefresh();
  const { items: contactRequests, refetch } = useCollection('apods:contactRequests');
  const { items: groupInvitations, refetch: refetchInvitations } = useCollection('interop:groupInvitations');

  const refetchAndRefresh = useCallback(async () => {
    await refetch();
    refresh();
  }, [refetch, refresh]);

  if (!contactRequests?.length && !groupInvitations?.length) return null;

  return (
    <Card className={classes.root}>
      <Box className={classes.title}>
        <Typography variant="body2">{translate('app.block.contact_requests')}</Typography>
      </Box>
      <Box p={1} pt={0}>
        {contactRequests?.map(activity => (
          <Box className={classes.list} key={activity.id}>
            <ContactRequest activity={activity} refetch={refetchAndRefresh} />
          </Box>
        ))}
        {groupInvitations?.map(activity => (
          <Box className={classes.list} key={activity.id}>
            <GroupInvitation activity={activity} refetch={refetchInvitations} />
          </Box>
        ))}
      </Box>
    </Card>
  );
};

export default ContactRequestsBlock;
