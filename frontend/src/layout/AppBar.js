import React from 'react';
import {useGetIdentity, UserMenu} from "react-admin";
import { Box, Container, Breadcrumbs, Link, makeStyles, Typography, Grid } from "@material-ui/core";

const useStyles = makeStyles(theme => ({
  topBar: {
    backgroundColor: theme.palette.primary.main
  },
  title: {
    fontWeight: '800',
    lineHeight: 0.8,
    paddingTop: '2rem'
  },
  menuBar: {
    backgroundColor: 'white',
    borderBottomColor: theme.palette.primary.main,
    borderBottomStyle: 'solid',
    borderBottomWidth: 4
  },
  link: {
    fontSize: '14pt',
    color: 'black',
    fontWeight: '300',
    lineHeight: '2.2em',
    // textTransform: 'uppercase'
  }
}));

const AppBar = ({ title, logout }) => {
  const classes = useStyles();
  const { identity } = useGetIdentity();
  return(
    <>
      <Box className={classes.topBar}>
        <Container>
          <Grid container>
            <Grid item xs={6}>
              <Typography variant="h1" className={classes.title}>{title}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Box display="flex" alignItems="start" justifyContent="right" pt={2}>
                <UserMenu logout={logout} />
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>
      <Box className={classes.menuBar}>
        <Container>
          <Breadcrumbs separator="|">
            <Link href="/Profile" className={classes.link}>
              Mon réseau
            </Link>
            <Link href={"/Profile/" + encodeURIComponent(identity?.profileData?.id)} className={classes.link}>
              Mon profil
            </Link>
            <Link href="/Location" className={classes.link}>
              Mes adresses
            </Link>
            <Link href="/settings" className={classes.link}>
              Paramètres
            </Link>
          </Breadcrumbs>
        </Container>
      </Box>
    </>
  )
};

export default AppBar;

