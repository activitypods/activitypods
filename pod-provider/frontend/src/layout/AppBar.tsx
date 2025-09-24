import React from 'react';
import { Link } from 'react-router-dom';
import { Box, Container, Typography, Grid } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import UserMenu from './UserMenu';
import { useDefaultTitle } from 'react-admin';

const useStyles = makeStyles()(theme => ({
  topBar: {
    backgroundColor: theme.palette.primary.main
  },
  title: {
    fontWeight: '800',
    lineHeight: 0.8,
    paddingTop: '2rem',

    [theme.breakpoints.down('sm')]: {
      paddingTop: '1.3rem',
      lineHeight: 0.8
    },
    '& a': {
      textDecoration: 'none !important'
    }
  }
}));

const AppBar = () => {
  const { classes } = useStyles();
  const title = useDefaultTitle();
  return (
    <Box className={classes.topBar}>
      <Container>
        <Grid container>
          <Grid size={6}>
            <Typography variant="h1" className={classes.title}>
              <Link to="/network">{title}</Link>
            </Typography>
          </Grid>
          <Grid size={6}>
            <Box display="flex" alignItems="start" justifyContent="right" pt={{ xs: 1, sm: 2 }} sx={{ width: '100%' }}>
              <UserMenu />
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default AppBar;
