import React from 'react';
import { useTranslate } from 'react-admin';
import { Typography, Box } from '@mui/material';

const ErrorMessage = ({ message }) => {
  const translate = useTranslate();
  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" sx={{ minHeight: 400 }}>
      <Typography align="center">{translate(message)}</Typography>
    </Box>
  );
};

export default ErrorMessage;
