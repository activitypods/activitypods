import React from 'react';
import classnames from 'classnames';
import { Notification, useGetIdentity, useTranslate, useNotify } from 'react-admin';
import { Card, Avatar, makeStyles, Typography } from '@material-ui/core';
import LockIcon from '@material-ui/icons/Lock';
import { Link, Redirect } from 'react-router-dom';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import ResetPasswordForm from './ResetPasswordForm';
import NewPasswordForm from './NewPasswordForm';

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

const LocalLoginPage = (props) => {
  const { title, classes: classesOverride, className, history, location, match, ...rest } = props;
  const classes = useStyles(props);
  const searchParams = new URLSearchParams(location.search);
  const isSignup = searchParams.has('signup');
  const isResetPassword = searchParams.has('reset_password');
  const isNewPassword = searchParams.has('new_password');
  const isLogin = !isSignup && !isResetPassword && !isNewPassword;

  searchParams.delete('reset_password'); // Delete parameter so that it doesn't appear on the links below
  searchParams.delete('signup'); // Delete parameter so that it doesn't appear on the links below
  const redirectTo = searchParams.get('redirect');
  const { identity, loading } = useGetIdentity();
  const translate = useTranslate();
  const notify = useNotify();

  if (loading) {
    return null;
  } else if (identity?.id) {
    const currentUrl = new URL(window.location.href).origin;
    if( redirectTo ) {
      if( redirectTo.startsWith(currentUrl) ) {
        window.location.href = redirectTo;
        return null;
      } else if ( redirectTo.startsWith('/') ) {
        return <Redirect to={redirectTo} />;
      } else if ( redirectTo.startsWith('http') ) {
        // Distant application
        const authorizedApps = process.env.REACT_APP_AUTHORIZED_APPS ? process.env.REACT_APP_AUTHORIZED_APPS.split(',') : [];
        if( authorizedApps.some(url => redirectTo.startsWith(url)) ) {
          const token = localStorage.getItem('token');
          const url = new URL(redirectTo);
          url.searchParams.set('token', token);
          window.location.href = url.toString();
          return null;
        } else {
          notify(translate('app.notification.app_not_authorized', { url: redirectTo }), 'error')
        }
      }
    } else {
      // Do not show login page if user is already connected
      return <Redirect to="/" />;
    }
  }

  return (
    <div className={classnames(classes.main, className)} {...rest}>
      <Card className={classes.card}>
        <div className={classes.avatar}>
          <Avatar className={classes.icon}>
            <LockIcon />
          </Avatar>
        </div>
        {isSignup ? <SignupForm redirectTo={redirectTo} /> : null}
        {isResetPassword ? <ResetPasswordForm /> : null}
        {isNewPassword ? <NewPasswordForm location={location} /> : null}
        {isLogin ? <LoginForm redirectTo={redirectTo} /> : null}

        <div className={classes.switch}>
          {isSignup || isResetPassword ? (
            <Link to={'/login?' + searchParams.toString()}>
              <Typography variant="body2">{translate('app.action.login')}</Typography>
            </Link>
          ) : null}
          {isLogin
            ?
            (
              <>
                <div>
                  <Link to={'/login?signup=true&' + searchParams.toString()}>
                    <Typography variant="body2">{translate('app.action.signup')}</Typography>
                  </Link>
                </div>
                <div>
                  <Link to={'/login?reset_password=true&' + searchParams.toString()}>
                    <Typography variant="body2">{translate('app.action.reset_password')}</Typography>
                  </Link>
                </div>
              </>
            ) : null
          }
        </div>
      </Card>
      <Notification />
    </div >
  );
};

export default LocalLoginPage;
