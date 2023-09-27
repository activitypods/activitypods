import React from 'react';
import { useGetIdentity } from 'react-admin';
import { ThemeProvider } from '@material-ui/core';
import AuthorizePageView from './AuthorizePageView';
import theme from '../../config/theme';

const AuthorizePage = props => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <ThemeProvider theme={theme}>
      <AuthorizePageView {...props} />
    </ThemeProvider>
  );
};

export default AuthorizePage;
