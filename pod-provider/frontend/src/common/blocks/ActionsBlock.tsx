import React from 'react';
import { useTranslate } from 'react-admin';
import { Box } from '@mui/material';
import LargeLabel from '../list/MainList/LargeLabel';

const ActionsBlock = ({ children }: { children: React.ReactNode }) => {
  const translate = useTranslate();
  return (
    <Box mb={2}>
      <LargeLabel>{translate('app.block.actions')}</LargeLabel>
      <Box
        sx={{
          '& a': { textDecoration: 'none' },
          '& .MuiButton-contained:not(.Mui-disabled)': {
            backgroundColor: 'secondary.main',
            color: 'secondary.contrastText',
            '&:hover': { backgroundColor: 'secondary.dark', color: 'secondary.contrastText' }
          },
          '& button': { mb: 1 },
          '& button:last-of-type': { mb: 0 }
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default ActionsBlock;
