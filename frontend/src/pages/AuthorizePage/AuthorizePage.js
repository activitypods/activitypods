import React from 'react';
import { ThemeProvider } from '@mui/material';
import AuthorizePageView from './AuthorizePageView';
import theme from '../../config/theme';

const AuthorizePage = () => (
  <ThemeProvider theme={theme}>
    <AuthorizePageView />
  </ThemeProvider>
);

export default AuthorizePage;
