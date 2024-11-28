import React from 'react';
import { Avatar, Grid } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import DetailsList from './DetailsList';

const useStyles = makeStyles(theme => ({
  root: {
    flexGrow: 1,
    margin: theme.spacing(-1),
    marginLeft: 4,
    marginRight: 4,
    marginBottom: theme.spacing(2),
    [theme.breakpoints.down('sm')]: {
      margin: theme.spacing(0)
    }
  },
  avatar: {
    width: 200,
    height: 200,
    marginRight: 10,
    [theme.breakpoints.down('sm')]: {
      width: 120,
      height: 120
    }
  }
}));

const Hero = ({ children, image }) => {
  const classes = useStyles();
  return (
    <div className={classes.root}>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={3}>
          <Avatar src={image} className={classes.avatar} />
        </Grid>
        <Grid item xs={12} sm={9}>
          <DetailsList>{children}</DetailsList>
        </Grid>
      </Grid>
    </div>
  );
};

export default Hero;
