import React, { useEffect } from 'react';
import { useGetIdentity } from 'react-admin';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import AuthorizePageView from './AuthorizePageView';
import theme from '../../config/theme';

const AuthorizePage = () => {
  const { data: identity } = useGetIdentity();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // If the redirection is a local page, skip this page
  // useEffect(() => {
  //   if (searchParams.has('redirect') && !searchParams.get('redirect').startsWith('http')) {
  //     navigate(searchParams.get('redirect') || '/');
  //   }
  // }, [navigate, searchParams]);

  if (!identity /*|| !searchParams.get('redirect').startsWith('http')*/) return null;
  return (
    <ThemeProvider theme={theme}>
      <AuthorizePageView />
    </ThemeProvider>
  );
};

export default AuthorizePage;
