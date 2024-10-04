import React from 'react';

// Simple TextField which display a given value, without looking at the record
const ValueField = ({ value, addLabel, ...rest }) => {
  return value && <span {...rest}>{value}</span>;
};

ValueField.defaultProps = {
  addLabel: true
};

export default ValueField;
