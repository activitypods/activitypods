import React, { useMemo } from 'react';
import { createTheme, ThemeProvider } from '@material-ui/core';
import LocalLoginPageView from './LocalLoginPageView';

const LocalLoginPage = props => {
  const muiTheme = useMemo(() => createTheme(props.theme), [props.theme]);
  return (
    <ThemeProvider theme={muiTheme}>
      <LocalLoginPageView {...props} />
    </ThemeProvider>
  );
};

export default LocalLoginPage;
