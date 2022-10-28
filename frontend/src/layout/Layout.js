import React from 'react';
import { Notification } from 'react-admin';
import { Box, ThemeProvider } from '@material-ui/core';
import ScrollToTop from './ScrollToTop';

const Layout = ({ logout, theme, children, title }) => (
  <ThemeProvider theme={theme}>
    <ScrollToTop />
    <Box>{children}</Box>
    {/* Required for react-admin optimistic update */}
    <Notification />
  </ThemeProvider>
);

export default Layout;
