import React from 'react';
import { TextField } from '@mui/material';

const TextInput = ({ meta: { touched, error }, input: inputProps, ...props }: any) => (
  <TextField error={!!(touched && error)} helperText={touched && error} {...inputProps} {...props} fullWidth />
);

export default TextInput;
