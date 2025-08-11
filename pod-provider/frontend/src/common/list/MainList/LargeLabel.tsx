import React from 'react';
import { Typography } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { DefaultTheme } from '@mui/styles/defaultTheme';

const useStyles = makeStyles()(theme => ({
  subTitle: {
    // @ts-expect-error TS(2339): Property 'spacing' does not exist on type 'Default... Remove this comment to see the full error message
    marginTop: theme.spacing(5),
    // @ts-expect-error TS(2339): Property 'spacing' does not exist on type 'Default... Remove this comment to see the full error message
    marginBottom: theme.spacing(1.5)
  },
  subTitleSpan: {
    // @ts-expect-error TS(2339): Property 'palette' does not exist on type 'Default... Remove this comment to see the full error message
    color: theme.palette.primary.contrastText,
    // @ts-expect-error TS(2339): Property 'palette' does not exist on type 'Default... Remove this comment to see the full error message
    backgroundColor: theme.palette.primary.main,
    // @ts-expect-error TS(2339): Property 'spacing' does not exist on type 'Default... Remove this comment to see the full error message
    paddingTop: theme.spacing(0.75),
    // @ts-expect-error TS(2339): Property 'spacing' does not exist on type 'Default... Remove this comment to see the full error message
    paddingBottom: theme.spacing(0),
    // @ts-expect-error TS(2339): Property 'spacing' does not exist on type 'Default... Remove this comment to see the full error message
    paddingLeft: theme.spacing(2),
    // @ts-expect-error TS(2339): Property 'spacing' does not exist on type 'Default... Remove this comment to see the full error message
    paddingRight: theme.spacing(5)
  }
}));

const LargeLabel = ({ children, ...rest }: any) => {
  const { classes } = useStyles();
  return (
    <Typography variant="h5" className={classes.subTitle} {...rest}>
      <span className={classes.subTitleSpan}>{children}</span>
    </Typography>
  );
};

export default LargeLabel;
