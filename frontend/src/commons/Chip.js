import * as React from 'react';
import { Chip as MuiChip, makeStyles } from '@material-ui/core';

const useStyles = makeStyles((theme) => ({
  root: {
    backgroundColor: 'unset',
    height: 20,
  },
  icon: {
    width: 14,
    height: 14,
    marginLeft: 0,
    marginRight: 2,
  },
  label: {
    paddingLeft: 4,
    '& span': {
      fontSize: 12,
      fontWeight: 'bold'
    },
  },
}));

const Chip = ({ children, ...rest }) => {
  const classes = useStyles();
  return <MuiChip size="small" label={children} classes={classes} {...rest} />;
};

export default Chip;
