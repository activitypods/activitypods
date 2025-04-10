import React from 'react';
import { useTranslate } from 'react-admin';
import { Typography, Box, CircularProgress } from '@mui/material';

const ProgressMessage = ({ message }) => {
  const translate = useTranslate();
  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" sx={{ minHeight: 400 }}>
      <CircularProgress size={100} thickness={6} sx={{ mb: 5 }} />
      <Typography align="center">{translate(message)}</Typography>
    </Box>
  );
};

export default ProgressMessage;
