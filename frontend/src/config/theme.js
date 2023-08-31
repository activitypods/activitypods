import { createTheme } from '@mui/material/styles';

const defaultTheme = createTheme();

const fontFamily = '"Open Sans", "sans-serif"';

const theme = createTheme({
  palette: {
    primary: {
      main: process.env.REACT_APP_COLOR_PRIMARY
    },
    secondary: {
      main: process.env.REACT_APP_COLOR_SECONDARY
    }
  },
  typography: {
    h1: {
      fontFamily,
      fontSize: 48,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '70px',
      [defaultTheme.breakpoints.down('xs')]: {
        fontSize: 32,
        lineHeight: '46px',
      },
    },
    h2: {
      fontFamily,
      fontSize: 40,
      fontStyle: 'normal',
      fontWeight: 'normal',
      [defaultTheme.breakpoints.down('xs')]: {
        fontSize: 28,
      },
    },
    h4: {
      fontFamily,
      fontSize: 30,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '44px',
      [defaultTheme.breakpoints.down('xs')]: {
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
    RaImageField: {
      styleOverrides: {
        image: {
          width: '100%',
          margin: 0,
          maxHeight: 200,
          objectFit: 'cover',
        },
      }
    },
    MuiButton: {
      styleOverrides: {
        contained: {
          borderRadius: 8,
          paddingLeft: 15,
          paddingRight: 15,
          height: 36,
          minWidth: 100
        },
      }
    },
    MuiAlert: {
      styleOverrides: {
        message: {
          paddingTop: 11,
        },
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          padding: 8,
          paddingRight: 0,
        },
      }
    },
    RaCreateButton: {
      styleOverrides: {
        floating: {
          backgroundColor: process.env.REACT_APP_COLOR_PRIMARY,
          bottom: 80
        }
      }
    },
    RaToolbar: {
      styleOverrides: {
        mobileToolbar: {
          bottom: 56
        }
      }
    },
    MuiScopedCssBaseline: {
      styleOverrides: {
        root: {
          backgroundColor: 'unset'
        }
      },
    },
  },
});

export default theme;
