import React from 'react';
import { Box, Button, makeStyles, Typography, ThemeProvider, useMediaQuery, Container, Avatar } from '@material-ui/core';
import { Link, useGetIdentity, useTranslate } from 'react-admin';
import { Redirect } from 'react-router-dom';
import theme from '../config/theme';

const useStyles = makeStyles(() => ({
  '@global': {
    body: {
      backgroundColor: theme.palette.primary.main
    }
  },
  circle: {
    borderRadius: '50%',
    backgroundColor: 'white',
    padding: 30,
    height: 400,
    width: 400,
    position: 'absolute',
    top: -100,
    [theme.breakpoints.down('xs')]: {
      width: '100vw',
      height: '100vw',
      padding: 0,
      top: -70,
    },
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
  stepsTitle: {
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 15
  },
  steps: {
    marginTop: 400,
    [theme.breakpoints.down('xs')]: {
      marginTop: 'calc(100vw - 30px)',
    },
  },
  step: {
    position: 'relative',
    paddingLeft: 90,
    marginBottom: 25,
    '& h4': {
      [theme.breakpoints.down('xs')]: {
        fontWeight: 'bold',
        lineHeight: '1.2em',
        marginBottom: 8
      }
    }
  },
  number: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 70,
    height: 70,
    fontWeight: 'bold',
    color: theme.palette.primary.main,
    backgroundColor: 'white',
    fontSize: 50
  }
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
      <Box display="flex" justifyContent="center">
        <Box className={classes.circle} display="flex" alignItems="center" justifyContent="center">
          <Box>
            <Typography align="center" variant="h1" className={classes.title}>
              {title}
            </Typography>
            <Typography align="center">
              {process.env.REACT_APP_DESCRIPTION}
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
        <Box className={classes.steps}>
          <Typography variant="h2" align="center" className={classes.stepsTitle}>Comment ça marche ?</Typography>
          <Container>
            <Box className={classes.step}>
              <Avatar className={classes.number}>1</Avatar>
              <Typography variant="h4">Je crée mon espace personnel (POD)</Typography>
              <Typography>Un seul endroit pour toutes mes données, c'est pas trop tôt !</Typography>
            </Box>
            <Box className={classes.step}>
              <Avatar className={classes.number}>2</Avatar>
              <Typography variant="h4">Je me connecte aux applications compatibles</Typography>
              <Typography>Rencontres, petites annonces... et beaucoup d'autres à venir !</Typography>
            </Box>
            <Box className={classes.step}>
              <Avatar className={classes.number}>3</Avatar>
              <Typography variant="h4">Mes données sont enregistrées sur mon POD</Typography>
              <Typography>Les administrateurs des applications n'y ont pas accès.</Typography>
            </Box>
            <Box className={classes.step}>
              <Avatar className={classes.number}>4</Avatar>
              <Typography variant="h4">Je choisis avec qui je partage mes données</Typography>
              <Typography>A tout moment, je sais qui voit mes données. Je peux révoquer les droits.</Typography>
            </Box>
          </Container>
       </Box>
      </Box>
    </ThemeProvider>
  );
};

export default HomePage;
