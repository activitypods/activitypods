import React, { useMemo } from 'react';
import { useGetIdentity, useTranslate } from 'react-admin';
import { makeStyles, Typography } from '@material-ui/core';
import LockIcon from '@material-ui/icons/Lock';
import { Link, Redirect } from 'react-router-dom';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import ResetPasswordForm from './ResetPasswordForm';
import NewPasswordForm from './NewPasswordForm';
import SimpleBox from "../../layout/SimpleBox";

const useStyles = makeStyles((theme) => ({
  switch: {
    margin: '1em',
    display: 'grid',
    textAlign: 'center',
    justifyContent: 'center',
  },
}));

const LocalLoginPage = (props) => {
  const classes = useStyles(props);
  const searchParams = new URLSearchParams(props.location.search);
  const isSignup = searchParams.has('signup');
  const isResetPassword = searchParams.has('reset_password');
  const isNewPassword = searchParams.has('new_password');
  const isLogin = !isSignup && !isResetPassword && !isNewPassword;

  searchParams.delete('reset_password'); // Delete parameter so that it doesn't appear on the links below
  searchParams.delete('signup'); // Delete parameter so that it doesn't appear on the links below
  const redirectTo = searchParams.get('redirect');
  const { identity, loading } = useGetIdentity();
  const translate = useTranslate();

  const [title, text] = useMemo(() => {
    if (isSignup) {
      return ['app.action.signup', 'app.helper.signup'];
    } else if (isLogin) {
      return ['app.action.login', 'app.helper.login'];
    } else if (isResetPassword) {
      return ['app.action.reset_password', 'app.helper.reset_password'];
    } else if (isNewPassword) {
      return ['app.action.set_new_password', 'app.helper.set_new_password'];
    }
  }, [isSignup, isLogin, isResetPassword, isNewPassword])

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
        return <Redirect to={'/authorize?redirect=' + encodeURIComponent(redirectTo)} />;
      }
    } else {
      // Do not show login page if user is already connected
      return <Redirect to="/" />;
    }
  }

  return (
    <SimpleBox title={translate(title)} icon={<LockIcon />} text={translate(text)}>
      {isSignup ? <SignupForm redirectTo={redirectTo} /> : null}
      {isResetPassword ? <ResetPasswordForm /> : null}
      {isNewPassword ? <NewPasswordForm location={props.location} /> : null}
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
    </SimpleBox >
  );
};

export default LocalLoginPage;
