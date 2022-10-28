import React from 'react';
import { Box, Button, makeStyles, Typography, ThemeProvider, useMediaQuery } from '@material-ui/core';
import { Link, useGetIdentity, useTranslate } from 'react-admin';
import { Redirect } from 'react-router-dom';
import theme from '../config/theme';

const useStyles = makeStyles(() => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    height: '1px',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 14em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
  },
  title: {
    lineHeight: 1,
    color: 'white',
  },
  text: {
    color: 'white',
  },
  badge: {
    top: 2,
    [theme.breakpoints.down('xs')]: {
      top: -3,
    },
  },
  logo: {
    fontSize: 100,
    color: 'white',
  },
  button: {
    margin: 5,
  },
}));

const HomePage = ({ title }) => {
  const classes = useStyles();
  const { loading, identity } = useGetIdentity();
  const translate = useTranslate();
  const xs = useMediaQuery(() => theme.breakpoints.down('xs'), { noSsr: true });

  if (loading) return null;

  return identity?.id ? (
    <Redirect to="/Profile" />
  ) : (
    <ThemeProvider theme={theme}>
      <Box className={classes.root}>
        <Typography variant="h3" className={classes.title}>
          {title}
        </Typography>
        <Box display="flex" flexDirection={xs ? 'column' : 'row'} pt={3} pb={3} alignItems="center">
          <Link to="/login?signup">
            <Button variant="contained" color="secondary" className={classes.button}>
              {translate('auth.action.signup')}
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="contained" color="secondary" className={classes.button}>
              {translate('ra.auth.sign_in')}
            </Button>
          </Link>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default HomePage;
