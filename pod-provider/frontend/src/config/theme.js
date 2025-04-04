import { createTheme, darken } from '@mui/material/styles';
import { defaultTheme as raTheme } from 'react-admin';
import { grey } from '@mui/material/colors';
const muiTheme = createTheme();
const fontFamily = '"Open Sans", "sans-serif"';
const theme = createTheme({
  ...raTheme,
  palette: {
    primary: {
      main: CONFIG.COLOR_PRIMARY
    },
    secondary: {
      main: CONFIG.COLOR_SECONDARY
    },
    black: {
      main: '#000'
    }
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
        lineHeight: '46px'
      }
    },
    h2: {
      fontFamily,
      fontSize: 40,
      fontStyle: 'normal',
      fontWeight: 'normal',
      [muiTheme.breakpoints.down('sm')]: {
        fontSize: 28
      }
    },
    h3: {
      fontFamily,
      fontSize: 35,
      fontStyle: 'normal',
      fontWeight: 'normal',
      [muiTheme.breakpoints.down('sm')]: {
        fontSize: 23
      }
    },

    h4: {
      fontFamily,
      fontSize: 30,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '44px',
      [muiTheme.breakpoints.down('sm')]: {
        fontSize: 18,
        lineHeight: '26px'
      }
    },
    h6: {
      fontFamily,
      fontSize: 20,
      fontStyle: 'normal',
      fontWeight: 'normal',
      letterSpacing: -1,
      lineHeight: 1.15
    },
    subtitle1: {
      fontFamily,
      fontSize: 12,
      lineHeight: '14px'
    },
    subtitle2: {
      fontFamily,
      fontSize: 12,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '14px',
      textTransform: 'uppercase'
    },
    body1: {
      fontFamily,
      fontSize: 16,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '19px'
    },
    body2: {
      fontFamily,
      fontSize: 14,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '16px'
    },
    button: {
      fontFamily,
      fontSize: 14,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '14px',
      textTransform: 'uppercase'
    }
  },
  components: {
    ...raTheme.components,
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          height: 36,
          minWidth: 100
        },
        contained: {
          color: '#000', // To keep great contrast with the primary color (WCAG 2.1 standards)
          '&:hover': {
            color: '#FFFFFF'
          }
        },
        containedSecondary: {
          color: '#FFFF'
        },
        outlined: {
          backgroundColor: '#FFFFFF',
          borderColor: CONFIG.COLOR_PRIMARY,
          color: darken(CONFIG.COLOR_PRIMARY, 0.2),
          borderWidth: 1.5, // Meilleure visibilité
          '&:hover': {
            color: darken(CONFIG.COLOR_PRIMARY, 0.6),
            borderColor: darken(CONFIG.COLOR_PRIMARY, 0.6)
          },
          '&:focus': {
            outline: `2px solid darken(CONFIG.COLOR_PRIMARY, 0.6)`,
            outlineOffset: 2
          },
          '&.Mui-disabled': {
            borderColor: grey[300],
            color: grey[500]
          }
        }
      }
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': {
            color: darken(CONFIG.COLOR_PRIMARY, 0.5) // Darker color for better contrast (WCAG 2.1 standards)
          },
          '&.Mui-disabled': {
            color: grey[700]
          }
        }
      }
    },
    MuiListItemText: {
      styleOverrides: {
        secondary: {
          color: grey[800] // Improve contrast of the grey activityPub identifiers (WCAG 2.1 standards)
        }
      }
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          color: grey[900],
          '&.Mui-disabled': {
            color: grey[700]
          }
        }
      }
    },
    MuiAlert: {
      styleOverrides: {
        message: {
          paddingTop: 11
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          padding: 8,
          paddingRight: 0
        }
      }
    },
    MuiScopedCssBaseline: {
      styleOverrides: {
        root: {
          backgroundColor: 'unset'
        }
      }
    },
    RaCreateButton: {
      styleOverrides: {
        root: {
          '&.RaCreateButton-floating': {
            backgroundColor: CONFIG.COLOR_SECONDARY,
            bottom: 80
          }
        }
      }
    },
    RaToolbar: {
      styleOverrides: {
        root: {
          '&.RaToolbar-mobileToolbar': {
            bottom: 56
          }
        }
      }
    },
    // Remove the large padding for the toolbar on mobile
    RaSimpleForm: {
      styleOverrides: {
        root: {
          [muiTheme.breakpoints.down('sm')]: {
            paddingBottom: 0,
            marginBottom: 68
          }
        }
      }
    }
  }
});

export default theme;
