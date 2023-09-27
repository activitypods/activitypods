import React from 'react';
import { makeStyles, Box, Card, Typography, Avatar, Button } from '@material-ui/core';
import { useGetIdentity, linkToRecord, useTranslate } from 'react-admin';
import { Link } from 'react-router-dom';
import { formatUsername } from '../../utils';

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
    }
  },
  status: {
    marginTop: 8,
    color: theme.palette.primary.main
  }
}));

const ProfileCard = () => {
  const classes = useStyles();
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  if (!identity) return null;
  return (
    <Card className={classes.root}>
      <Box className={classes.title}>
        <Box display="flex" justifyContent="center" className={classes.avatarWrapper}>
          <Avatar src={identity.profileData?.['vcard:photo']} className={classes.avatar} />
        </Box>
      </Box>
      <Box className={classes.block}>
        <Typography variant="h2" align="center">
          {identity.profileData?.['vcard:given-name']}
        </Typography>
        <Typography align="center">{formatUsername(identity.id)}</Typography>
      </Box>
      <Box className={classes.button} pb={3} pr={3} pl={3}>
        <Link to={linkToRecord('/Profile', identity?.webIdData?.url)}>
          <Button variant="contained" color="secondary" type="submit">
            {translate('app.action.edit_profile')}
          </Button>
        </Link>
      </Box>
    </Card>
  );
};

export default ProfileCard;
