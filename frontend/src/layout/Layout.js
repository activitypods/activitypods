import React from 'react';
import { Notification } from 'react-admin';
import { Box, Container, ThemeProvider, useMediaQuery } from '@material-ui/core';
import ScrollToTop from './ScrollToTop';
import AppBar from "./AppBar";

const Layout = ({ logout, theme, children, title }) => {
  const xs = useMediaQuery(theme.breakpoints.down('xs'));
  return (
    <ThemeProvider theme={theme}>
      <ScrollToTop />
      <AppBar title={title} logout={logout} />
      <Container disableGutters={xs}>
        <Box mt={{ xs: 1, sm: 2 }}>{children}</Box>
      </Container>
      {/* Required for react-admin optimistic update */}
      <Notification />
    </ThemeProvider>
  );
}

export default Layout;
