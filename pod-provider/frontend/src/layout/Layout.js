import React from 'react';
import { Helmet } from 'react-helmet';
import { Box, Container, useMediaQuery } from '@mui/material';
import ScrollToTop from './ScrollToTop';
import AppBar from './AppBar';
import MenuBar from './MenuBar';
import BottomBar from './BottomBar';
import BackgroundChecks from '../common/BackgroundCheck';
import SyncUserLocale from '../common/SyncUserLocale';

const Layout = props => {
  const { children, title } = props;
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });
  return (
    <BackgroundChecks>
      <SyncUserLocale />
      <Helmet>
        <title>{title}</title>
      </Helmet>
      <ScrollToTop />
      <AppBar title={title} />
      {!xs && <MenuBar />}
      <Container disableGutters={xs}>
        <Box mt={{ xs: 2, sm: 2 }} m={{ xs: 2, sm: 0 }} mb={8}>
          {children}
        </Box>
      </Container>
      {xs && <BottomBar />}
    </BackgroundChecks>
  );
};

export default Layout;
