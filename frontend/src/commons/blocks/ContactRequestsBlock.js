import React from 'react';
import { linkToRecord, useQueryWithStore, useTranslate, Link } from 'react-admin';
import { makeStyles, Card, Avatar, Grid, Typography, Box, useMediaQuery } from '@material-ui/core';
import { useCollection } from '@semapps/activitypub-components';
import { formatUsername } from '../../utils';
import AcceptContactRequestButton from "../buttons/AcceptContactRequestButton";
import IgnoreContactRequestButton from "../buttons/IgnoreContactRequestButton";
import RejectContactRequestButton from "../buttons/RejectContactRequestButton";

const useStyles = makeStyles((theme) => ({
  root: {
    marginTop: 5,
    marginBottom: 24,
  },
  title: {
    borderBottom: '1px lightgrey solid',
    padding: 12,
  },
  list: {
    padding: 10,
    paddingLeft: 70,
    position: 'relative',
    height: 55,
    [theme.breakpoints.down('sm')]: {
      height: 105,
    },
  },
  name: {
    fontWeight: 'bold',
    lineHeight: 2,
    marginRight: 6,
    color: 'black'
  },
  avatar: {
    width: 50,
    height: 50,
    left: 12,
    top: 12,
    position: 'absolute',
  },
  button: {
    margin: 6,
    [theme.breakpoints.down('sm')]: {
      margin: 0,
      marginRight: 6,
    },
  },
}));

const ContactRequest = ({ activity, refetch }) => {
  const classes = useStyles();
  const xs = useMediaQuery((theme) => theme.breakpoints.down('xs'), { noSsr: true });
  const translate = useTranslate();

  let { loading, data: profile } = useQueryWithStore({
    type: 'getOne',
    resource: 'Profile',
    payload: { id: activity.object.object },
  });

  if (loading) return null;

  const message = activity.content || (activity.context ? translate('app.message.you_participated_to_same_event') : '');

  return (
    <>
      <Link to={linkToRecord('/Profile', activity.object.object, 'show')}>
        <Avatar src={profile?.['vcard:photo']} className={classes.avatar} />
      </Link>
      <Grid container spacing={xs ? 2 : 2}>
        <Grid item xs={12} sm={8}>
          <div>
            <Link to={linkToRecord('/Profile', activity.object.object, 'show')}>
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
            <AcceptContactRequestButton activity={activity} refetch={refetch} variant="contained" color="primary" className={classes.button} >
              {translate('app.action.accept')}
            </AcceptContactRequestButton>
            {activity.context ? (
              <IgnoreContactRequestButton activity={activity} refetch={refetch} variant="contained" color="grey" className={classes.button}>
                {translate('app.action.ignore')}
              </IgnoreContactRequestButton>
            ) : (
              <RejectContactRequestButton activity={activity} refetch={refetch} variant="contained" color="grey" className={classes.button}>
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
  const { items: contactRequests, refetch } = useCollection('apods:contactRequests');

  if (contactRequests.length === 0) return null;

  return (
    <Card className={classes.root}>
      <Box className={classes.title}>
        <Typography variant="body2">{translate('app.block.contact_requests')}</Typography>
      </Box>
      {contactRequests.map((activity) => (
        <Box className={classes.list}>
          <ContactRequest activity={activity} refetch={refetch} />
        </Box>
      ))}
    </Card>
  );
};

export default ContactRequestsBlock;
