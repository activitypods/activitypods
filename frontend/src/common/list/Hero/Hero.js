import React from 'react';
import { useShowContext } from 'react-admin';
import { Grid, Avatar, makeStyles } from '@material-ui/core';
import DetailsList from './DetailsList';

const useStyles = makeStyles(theme => ({
  root: {
    // flexGrow: 1,
    // margin: theme.spacing(-1)
  },
  avatar: {
    // position: 'absolute',
    // top: 0,
    // left: 0,
    width: 200,
    height: 200,
    [theme.breakpoints.down('xs')]: {
      width: 100,
      height: 100,
    },
  },
}));

const Hero = ({ children, image, defaultImage }) => {
  const classes = useStyles();
  const { basePath, loaded, record, resource } = useShowContext();
  if (!loaded) return null;

  return (
    <div className={classes.root}>
      <Grid container spacing={5}>
        <Grid item xs={12} sm={3}>
          <Avatar src={record[image]} className={classes.avatar} />
        </Grid>
        <Grid item xs={12} sm={9}>
          <DetailsList record={record} resource={resource} basePath={basePath}>
            {children}
          </DetailsList>
        </Grid>
      </Grid>
    </div>
  );
};

export default Hero;
