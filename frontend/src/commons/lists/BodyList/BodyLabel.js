import React from 'react';
import { makeStyles, Typography } from '@material-ui/core';

const useStyles = makeStyles((theme) => ({
  first: {
    fontSize: 28,
    lineHeight: 1.3,
    marginBottom: theme.spacing(2),
  },
  root: {
    fontSize: 28,
    lineHeight: 1.3,
    marginTop: theme.spacing(3),
    marginBottom: theme.spacing(2),
  },
  span: {
    color: theme.palette.primary.contrastText,
    backgroundImage: `radial-gradient(circle at 50% 4em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    paddingBottom: theme.spacing(0.25),
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(5),
  },
}));

const BodyLabel = ({ first, children }) => {
  const classes = useStyles();
  return (
    <Typography variant="h4" color="secondary" className={first ? classes.first : classes.root}>
      <span className={classes.span}>{children}</span>
    </Typography>
  );
};

export default BodyLabel;
