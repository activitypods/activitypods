import React from 'react';
import { useTranslate, getFieldLabelTranslationArgs, useRecordContext, useResourceContext } from 'react-admin';
import { Box } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import LargeLabel from './LargeLabel';

const useStyles = makeStyles(() => ({
  divider: {
    paddingTop: 5,
    paddingBottom: 20,
    borderBottom: '1px lightgrey solid',
    '&:last-child': {
      borderBottom: 'none'
    }
  }
}));

const MainList = ({ children, divider, Label = LargeLabel }) => {
  const translate = useTranslate();
  const classes = useStyles();
  const record = useRecordContext();
  const resource = useResourceContext();
  if (!record) return null;

  return (
    <Box>
      {React.Children.map(children, field =>
        field && record[field.props.source] && React.isValidElement(field) ? (
          <div key={field.props.source} className={divider ? classes.divider : null}>
            {field.props.label !== false ? (
              <>
                <Label>
                  {translate(
                    ...getFieldLabelTranslationArgs({
                      label: field.props.label,
                      resource,
                      source: field.props.source
                    })
                  )}
                </Label>
                {field}
              </>
            ) : (
              field
            )}
          </div>
        ) : null
      )}
    </Box>
  );
};

export default MainList;
