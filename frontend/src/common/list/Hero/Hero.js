import React from 'react';
import { useShowContext } from 'react-admin';
import { Grid, Avatar } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import DetailsList from './DetailsList';

const useStyles = makeStyles(theme => ({
  root: {
    flexGrow: 1,
    margin: theme.spacing(-1),
    marginBottom: theme.spacing(2),
    [theme.breakpoints.down('sm')]: {
      margin: theme.spacing(2),
    },
  },
  avatar: {
    width: 200,
    height: 200,
    [theme.breakpoints.down('sm')]: {
      width: 120,
      height: 120,
    },
  }
}));

const Hero = ({ children, image }) => {
  const classes = useStyles();
  const { record, isLoading } = useShowContext();
  if (isLoading) return null;

  return (
    <div className={classes.root}>
      <Grid container spacing={7}>
        <Grid item xs={12} sm={3}>
          <Avatar src={record[image]} className={classes.avatar} />
        </Grid>
        <Grid item xs={12} sm={9}>
          <DetailsList>
            {children}
          </DetailsList>
        </Grid>
      </Grid>
    </div>
  );
};

export default Hero;
