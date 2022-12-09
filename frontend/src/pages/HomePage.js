import React from 'react';
import { Box, Button, makeStyles, Typography, ThemeProvider, useMediaQuery } from '@material-ui/core';
import { Link, useGetIdentity, useTranslate } from 'react-admin';
import { Redirect } from 'react-router-dom';
import theme from '../config/theme';

const useStyles = makeStyles(() => ({
  root: {
    // display: 'flex',
    // flexDirection: 'column',
    minHeight: '100vh',
    // height: '1px',
    // alignItems: 'center',
    // justifyContent: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 14em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
  },
  circle: {
    borderRadius: '50%',
    backgroundColor: 'white',
    padding: 30,
    height: 400,
    width: 400,
    position: 'absolute',
    top: -100
  },
  title: {
    fontWeight: '800',
    paddingTop: 50
  },
  text: {
    color: 'white',
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
      <Box className={classes.root} display="flex" justifyContent="center">
        <Box className={classes.circle} display="flex" alignItems="center" justifyContent="center">
          <Box>
            <Typography align="center" variant="h1" className={classes.title}>
              {title}
            </Typography>
            <Typography align="center">
              Votre hébergeur de PODs dans l'Oise !
            </Typography>
            <Box display="flex" flexDirection={xs ? 'column' : 'row'} pt={3} pb={3} alignItems="center" justifyContent="center">
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
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default HomePage;
