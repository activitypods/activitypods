import React from 'react';
import { Notification } from 'react-admin';
import { Box, Container, ThemeProvider, useMediaQuery } from '@material-ui/core';
import ScrollToTop from './ScrollToTop';
import AppBar from "./AppBar";
import MenuBar from "./MenuBar";
import BottomBar from "./BottomBar";

const Layout = ({ logout, theme, children, title }) => {
  const xs = useMediaQuery(theme.breakpoints.down('xs'), { noSsr: true });
  return (
    <ThemeProvider theme={theme}>
      <ScrollToTop />
      <AppBar title={title} logout={logout} />
      {!xs && <MenuBar />}
      <Container disableGutters={xs}>
        <Box mt={{ xs: 1, sm: 2 }} m={{ xs: 2, sm: 0 }} mb={8}>{children}</Box>
      </Container>
      {xs && <BottomBar />}
      {/* Required for react-admin optimistic update */}
      <Notification />
    </ThemeProvider>
  );
}

export default Layout;
