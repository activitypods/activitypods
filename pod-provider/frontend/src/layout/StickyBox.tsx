import React from 'react';
import ReactStickyBox from 'react-sticky-box';
import makeStyles from '@mui/styles/makeStyles';

const useStyles = makeStyles(() => ({
  root: {
    marginTop: 5
  }
}));

const StickyBox = ({ children }) => {
  const classes = useStyles();
  return (
    <ReactStickyBox offsetTop={20} className={classes.root}>
      {children}
    </ReactStickyBox>
  );
};

export default StickyBox;
