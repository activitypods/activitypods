import React from 'react';
import { useTranslate } from 'react-admin';
import { Typography, Box, CircularProgress } from '@mui/material';

const ProgressMessage = ({ message }) => {
  const translate = useTranslate();
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      sx={{
        minHeight: '100vh',
        px: 2,
        background:
          'radial-gradient(circle at 14% 10%, rgba(91,87,229,0.12), transparent 45%), linear-gradient(180deg, #f5f7fb 0%, #eef2f9 100%)'
      }}
    >
      <CircularProgress size={88} thickness={4.8} sx={{ mb: 3, color: '#5B57E5' }} />
      <Typography align="center" sx={{ fontSize: 16, fontWeight: 600, color: '#2D2D2D' }}>
        {translate(message)}
      </Typography>
    </Box>
  );
};

export default ProgressMessage;
