import { createTheme } from '@mui/material/styles';
import { defaultTheme as raTheme } from 'react-admin';
const muiTheme = createTheme();
const fontFamily = '"Open Sans", "sans-serif"';
const theme = createTheme({
  ...raTheme,
  palette: {
    primary: {
      main: process.env.REACT_APP_COLOR_PRIMARY,
    },
    secondary: {
      main: process.env.REACT_APP_COLOR_SECONDARY,
    },
    black: {
      main: '#000',
    },
    grey: {
      main: '#BDBDBD',
    },
  },
  typography: {
    h1: {
      fontFamily,
      fontSize: 48,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '70px',
      [muiTheme.breakpoints.down('sm')]: {
        fontSize: 32,
        lineHeight: '46px',
      },
    },
    h2: {
      fontFamily,
      fontSize: 40,
      fontStyle: 'normal',
      fontWeight: 'normal',
      [muiTheme.breakpoints.down('sm')]: {
        fontSize: 28,
      },
    },
    h4: {
      fontFamily,
      fontSize: 30,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '44px',
      [muiTheme.breakpoints.down('sm')]: {
        fontSize: 18,
        lineHeight: '26px',
      },
    },
    h6: {
      fontFamily,
      fontSize: 20,
      fontStyle: 'normal',
      fontWeight: 'normal',
      letterSpacing: -1,
      lineHeight: 1.15,
    },
    subtitle1: {
      fontFamily,
      fontSize: 12,
      lineHeight: '14px',
    },
    subtitle2: {
      fontFamily,
      fontSize: 12,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '14px',
      textTransform: 'uppercase',
    },
    body1: {
      fontFamily,
      fontSize: 16,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '19px',
    },
    body2: {
      fontFamily,
      fontSize: 14,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '16px',
    },
    button: {
      fontFamily,
      fontSize: 14,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '14px',
      textTransform: 'uppercase',
    },
  },
  components: {
    ...raTheme.components,
    MuiButton: {
      styleOverrides: {
        contained: {
          borderRadius: 8,
          paddingLeft: 15,
          paddingRight: 15,
          height: 36,
          minWidth: 100,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        message: {
          paddingTop: 11,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          padding: 8,
          paddingRight: 0,
        },
      },
    },
    MuiScopedCssBaseline: {
      styleOverrides: {
        root: {
          backgroundColor: 'unset',
        },
      },
    },
    RaCreateButton: {
      styleOverrides: {
        root: {
          '&.RaCreateButton-floating': {
            backgroundColor: process.env.REACT_APP_COLOR_SECONDARY,
            bottom: 80,
          },
        },
      },
    },
    RaToolbar: {
      styleOverrides: {
        root: {
          '&.RaToolbar-mobileToolbar': {
            bottom: 56,
          },
        },
      },
    },
    // Remove the large padding for the toolbar on mobile
    RaSimpleForm: {
      styleOverrides: {
        root: {
          [muiTheme.breakpoints.down('sm')]: {
            paddingBottom: 0,
            marginBottom: 68,
          },
        },
      },
    },
  },
});

export default theme;
