import React from 'react';
import { TextField } from '@material-ui/core';

const TextInput = ({ meta: { touched, error }, input: inputProps, ...props }) => (
  <TextField error={!!(touched && error)} helperText={touched && error} {...inputProps} {...props} fullWidth />
);

export default TextInput;
