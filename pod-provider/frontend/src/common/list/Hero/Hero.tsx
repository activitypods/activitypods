import React from 'react';
import { Avatar, Grid } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import DetailsList from './DetailsList';

const useStyles = makeStyles(theme => ({
  root: {
    flexGrow: 1,
    // @ts-expect-error TS(2339): Property 'spacing' does not exist on type 'Default... Remove this comment to see the full error message
    marginTop: theme.spacing(2),
    marginLeft: 4,
    marginRight: 4,
    // @ts-expect-error TS(2339): Property 'spacing' does not exist on type 'Default... Remove this comment to see the full error message
    marginBottom: theme.spacing(2),
    // @ts-expect-error TS(2339): Property 'breakpoints' does not exist on type 'Def... Remove this comment to see the full error message
    [theme.breakpoints.down('sm')]: {
      // @ts-expect-error TS(2339): Property 'spacing' does not exist on type 'Default... Remove this comment to see the full error message
      margin: theme.spacing(0)
    }
  },
  avatar: {
    width: 200,
    height: 200,
    marginRight: 10,
    // @ts-expect-error TS(2339): Property 'breakpoints' does not exist on type 'Def... Remove this comment to see the full error message
    [theme.breakpoints.down('sm')]: {
      width: 120,
      height: 120
    }
  }
}));

const Hero = ({ children, image }: any) => {
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
