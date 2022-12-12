import React, { useCallback } from 'react';
import {
  Notification,
  useRedirect,
} from 'react-admin';
import {Card, Avatar, makeStyles, Typography, Box} from '@material-ui/core';
import WarningIcon from '@material-ui/icons/Warning';

const useStyles = makeStyles((theme) => ({
  main: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    height: '1px',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: theme.palette.primary.main
  },
  card: {
    minWidth: 300,
    maxWidth: 500,
    marginTop: '6em',
    [theme.breakpoints.down('sm')]: {
      marginTop: '2em',
    },
  },
  avatar: {
    margin: '1em',
    display: 'flex',
    justifyContent: 'center',
  },
  icon: {
    backgroundColor: theme.palette.secondary[500],
  },
  switch: {
    margin: '1em',
    display: 'grid',
    textAlign: 'center',
    justifyContent: 'center',
  },
}));

const AuthorizePageView = (props) => {
  const { title, classes: classesOverride, className, history, location, match, ...rest } = props;
  const classes = useStyles(props);

  return (
    <Box className={classes.main}>
      <Card className={classes.card}>
        <div className={classes.avatar}>
          <Avatar className={classes.icon}>
            <WarningIcon />
          </Avatar>
        </div>
        <Box pl={2} pr={2}>
          <Typography variant="body2" align="center">
            Souhaitez-vous autoriser l'application Bienvenue chez moi à accéder à votre POD ?
          </Typography>
        </Box>
      </Card>
      <Notification />
    </Box >
  );
};

export default AuthorizePageView;
