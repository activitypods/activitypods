import React from 'react';
import { useShowContext } from 'react-admin';
import { Grid, Avatar, makeStyles } from '@material-ui/core';
import DetailsList from './DetailsList';

const useStyles = makeStyles((theme) => ({
  avatar: {
    width: 200,
    height: 200,
    [theme.breakpoints.down('xs')]: {
      width: 120,
      height: 120,
    },
  },
}));

const Hero = ({ children, image, defaultImage }) => {
  const classes = useStyles();
  const { basePath, loaded, record, resource } = useShowContext();
  if (!loaded) return null;

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} sm={3}>
        <Avatar src={record[image]} className={classes.avatar} />
      </Grid>
      <Grid item xs={12} sm={9}>
        <DetailsList record={record} resource={resource} basePath={basePath}>
          {children}
        </DetailsList>
      </Grid>
    </Grid>
  );
};

export default Hero;
