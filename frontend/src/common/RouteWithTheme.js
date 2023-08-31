import React, { useMemo } from 'react';
import { RouteWithoutLayout } from "react-admin";
import { createTheme, ThemeProvider } from '@mui/material';

const PageWithTheme = ({ theme, children, ...rest }) => {
  console.log('component', children)
  const muiTheme = useMemo(() => createTheme(theme), [theme]);
  return (
    <ThemeProvider theme={muiTheme}>
      {React.cloneElement(children, rest)}
    </ThemeProvider >
  );
};

const RouteWithTheme = (props) => {
  return (
    <RouteWithoutLayout
      {...props}
      component={p => <PageWithTheme {...p}>{React.createElement(props.component)}</PageWithTheme>}
    />
  );
}

export default RouteWithTheme;
