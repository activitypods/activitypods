import React from 'react';
import ReactStickyBox from 'react-sticky-box';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles((theme) => ({
  root: {
    marginTop: 5,
  }
}));

const StickyBox = ({ children }) => {
  const classes = useStyles();
  return (
    <ReactStickyBox offsetTop={86} className={classes.root}>
      {children}
    </ReactStickyBox>
  );
};

export default StickyBox;
