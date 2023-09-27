import React from 'react';
import { Box, Container, useMediaQuery } from '@mui/material';
import ScrollToTop from './ScrollToTop';
import AppBar from './AppBar';
import MenuBar from './MenuBar';
import BottomBar from './BottomBar';

const Layout = props => {
  const { children, title } = props;
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });
  return (
    <>
      <ScrollToTop />
      <AppBar title={title} />
      {!xs && <MenuBar />}
      <Container disableGutters={xs}>
        <Box mt={{ xs: 2, sm: 2 }} m={{ xs: 2, sm: 0 }} mb={8}>
          {children}
        </Box>
      </Container>
      {xs && <BottomBar />}
    </>
  );
};

export default Layout;
