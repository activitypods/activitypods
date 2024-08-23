import React from 'react';
import { ReferenceField } from 'react-admin';
import { Grid } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import DetailsList from './DetailsList';
import AvatarField from '../../fields/AvatarField';

const useStyles = makeStyles(theme => ({
  root: {
    flexGrow: 1,
    margin: theme.spacing(-1),
    marginBottom: theme.spacing(2),
    [theme.breakpoints.down('sm')]: {
      margin: theme.spacing(2)
    }
  },
  avatar: {
    width: 200,
    height: 200,
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
      <Grid container spacing={7}>
        <Grid item xs={12} sm={3}>
          <ReferenceField source="url" reference="Profile" link={false}>
            <AvatarField source={image} className={classes.avatar} />
          </ReferenceField>
        </Grid>
        <Grid item xs={12} sm={9}>
          <DetailsList>{children}</DetailsList>
        </Grid>
      </Grid>
    </div>
  );
};

export default Hero;
