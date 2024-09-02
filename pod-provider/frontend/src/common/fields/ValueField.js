import React from 'react';
import { Typography } from '@mui/material';

// Simple TextField which display a given value, without looking at the record
const ValueField = ({ value, ...rest }) => {
  return <Typography {...rest}>{value}</Typography>;
};

ValueField.defaultProps = {
  addLabel: true,
  source: 'id' // Always display the field
};

export default ValueField;
