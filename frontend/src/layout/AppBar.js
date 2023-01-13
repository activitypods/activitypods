import React from 'react';
import { UserMenu } from "react-admin";
import { Link } from 'react-router-dom';
import {
  Box,
  Container,
  makeStyles,
  Typography,
  Grid,
} from "@material-ui/core";

const useStyles = makeStyles(theme => ({
  topBar: {
    backgroundColor: theme.palette.primary.main
  },
  title: {
    fontWeight: '800',
    lineHeight: 0.8,
    paddingTop: '2rem',

    [theme.breakpoints.down('xs')]: {
      paddingTop: '1.3rem',
      lineHeight: 0.8,
    },
    '& a': {
      textDecoration: 'none !important',
    }
  }
}));

const AppBar = ({ title, logout }) => {
  const classes = useStyles();
  return(
    <Box className={classes.topBar}>
      <Container>
        <Grid container>
          <Grid item xs={6}>
            <Typography variant="h1" className={classes.title}>
              <Link to="/Profile">{title}</Link>
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Box display="flex" alignItems="start" justifyContent="right" pt={{ xs: 1, sm: 2 }}>
              <UserMenu logout={logout} />
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  )
};

export default AppBar;

