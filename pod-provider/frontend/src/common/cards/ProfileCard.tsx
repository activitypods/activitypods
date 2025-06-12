import React from 'react';
import { Box, Card, Typography, Avatar } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { useGetIdentity } from 'react-admin';
import { formatUsername } from '../../utils';
import EditProfileButton from '../buttons/EditProfileButton';
import { useTranslate } from 'react-admin';

const useStyles = makeStyles(theme => ({
  root: {
    marginTop: 5,
    marginBottom: 24,
    [theme.breakpoints.down('sm')]: {
      marginTop: 16,
      marginBottom: 16
    }
  },
  title: {
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 14em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    color: theme.palette.primary.contrastText,
    height: 85,
    position: 'relative',
    [theme.breakpoints.down('sm')]: {
      height: 70
    }
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
    height: 150,
    [theme.breakpoints.down('sm')]: {
      width: 100,
      height: 100
    }
  },
  block: {
    backgroundColor: 'white',
    paddingTop: 80,
    paddingBottom: 20,
    [theme.breakpoints.down('sm')]: {
      paddingTop: 50,
      paddingBottom: 16
    }
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
  const { data: identity } = useGetIdentity();
  const translate = useTranslate();
  if (!identity) return null;
  return (
    <Card className={classes.root}>
      <Box className={classes.title}>
        <Box display="flex" justifyContent="center" className={classes.avatarWrapper}>
          <Avatar
            src={identity.avatar}
            className={classes.avatar}
            alt={translate('app.accessibility.your_profile_picture')}
          />
        </Box>
      </Box>
      <Box className={classes.block}>
        <Typography variant="h2" align="center">
          {identity.fullName}
        </Typography>
        <Typography align="center">{formatUsername(identity.id)}</Typography>
      </Box>
      <Box className={classes.button} pb={3} pr={3} pl={3}>
        <EditProfileButton color="secondary" />
      </Box>
    </Card>
  );
};

export default ProfileCard;
