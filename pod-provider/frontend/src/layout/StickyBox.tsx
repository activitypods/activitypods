import React from 'react';
import ReactStickyBox from 'react-sticky-box';
import { makeStyles } from 'tss-react/mui';

const useStyles = makeStyles()(() => ({
  root: {
    marginTop: 5
  }
}));

const StickyBox = ({ children }: any) => {
  const { classes } = useStyles();
  return (
    <ReactStickyBox offsetTop={20} className={classes.root}>
      {children}
    </ReactStickyBox>
  );
};

export default StickyBox;
