import React from 'react';
import { useTranslate, getFieldLabelTranslationArgs, useRecordContext, useResourceContext } from 'react-admin';
import { Box, Grid, Typography } from '@mui/material';

import makeStyles from '@mui/styles/makeStyles';

const useStyles = makeStyles(() => ({
  line: {
    borderBottom: '1px solid #e0e0e0'
  },
  container: {
    marginTop: 0,
    marginBottom: 0
  },
  item: {
    padding: '12px !important'
  }
}));

const DetailsList = ({ children }: any) => {
  const classes = useStyles();
  const translate = useTranslate();
  const record = useRecordContext();
  const resource = useResourceContext();
  if (!record) return null;

  return (
    <Box>
      {React.Children.map(children, (field, i) =>
        field &&
        (field.props.source ? record[field.props.source] : field.props.value) &&
        React.isValidElement(field) ? (
          <div key={i} className={classes.line}>
            <>{/*  @ts-expect-error TS(2571): Object is of type 'unknown'.*/}</>
            {field.props.label !== false ? (
              <Grid container spacing={3} className={classes.container}>
                <Grid item xs={4} sm={3} className={classes.item}>
                  <Typography color="textSecondary" align="right" variant="body2">
                    {translate(
                      ...getFieldLabelTranslationArgs({
                        // @ts-expect-error TS(2571): Object is of type 'unknown'.
                        label: field.props.label,
                        resource,
                        // @ts-expect-error TS(2571): Object is of type 'unknown'.
                        source: field.props.source
                      })
                    )}
                  </Typography>
                </Grid>
                <Grid item xs={8} sm={9} className={classes.item}>
                  <Typography variant="body2" component="div">
                    {field}
                  </Typography>
                </Grid>
              </Grid>
            ) : (
              field
            )}
          </div>
        ) : null
      )}
    </Box>
  );
};

export default DetailsList;
