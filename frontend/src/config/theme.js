import { createTheme } from '@material-ui/core/styles';

const defaultTheme = createTheme();

const font2 = '"Open Sans", "sans-serif"';

const theme = createTheme({
  palette: {
    primary: {
      main: '#c9e265',
      light: '#c3d57a',
      contrastText: '#000',
    },
    secondary: {
      main: '#314a62',
      contrastText: '#FFF',
    }
  },
  typography: {
    h1: {
      fontFamily: font2,
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
      fontFamily: font2,
      fontSize: 40,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '58px',
      [defaultTheme.breakpoints.down('xs')]: {
        fontSize: 28,
        lineHeight: '41px',
      },
    },
    h4: {
      fontFamily: font2,
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
      fontFamily: font2,
      fontSize: 20,
      fontStyle: 'normal',
      fontWeight: 'normal',
      letterSpacing: -1,
      lineHeight: 1.15,
    },
    subtitle1: {
      fontFamily: font2,
      fontSize: 12,
      lineHeight: '14px',
    },
    subtitle2: {
      fontFamily: font2,
      fontSize: 12,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '14px',
      textTransform: 'uppercase',
    },
    body1: {
      fontFamily: font2,
      fontSize: 16,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '19px',
    },
    body2: {
      fontFamily: font2,
      fontSize: 14,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '16px',
    },
    button: {
      fontFamily: font2,
      fontSize: 14,
      fontStyle: 'normal',
      fontWeight: 'normal',
      lineHeight: '14px',
      textTransform: 'uppercase',
    },
  },
  overrides: {
    RaImageField: {
      image: {
        width: '100%',
        margin: 0,
        maxHeight: 200,
        objectFit: 'cover',
      },
    },
    MuiButton: {
      contained: {
        borderRadius: 8,
        paddingLeft: 15,
        paddingRight: 15,
        height: 36,
        minWidth: 100
      },
    },
    MuiAlert: {
      message: {
        paddingTop: 11,
      },
    },
    MuiIconButton: {
      root: {
        padding: 8,
        paddingRight: 0,
      },
    },
  },
});

export default theme;
