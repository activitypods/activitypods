import React, { useMemo } from 'react';
import { Notification } from 'react-admin';
import { ThemeProvider } from '@mui/system';
import { createTheme } from '@mui/material/styles';
import { StyledEngineProvider } from '@mui/material';
import PodLoginPageView from './PodLoginPageView';

const PodLoginPage = props => {
  const muiTheme = useMemo(() => createTheme(props.theme), [props.theme]);
  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={muiTheme}>
        <PodLoginPageView {...props} />
        <Notification />
      </ThemeProvider>
    </StyledEngineProvider>
  );
};

export default PodLoginPage;
