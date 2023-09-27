import React from 'react';
import { useTranslate, getFieldLabelTranslationArgs, useShowContext } from 'react-admin';
import { Box, makeStyles } from '@material-ui/core';
import LargeLabel from './LargeLabel';

const useStyles = makeStyles(theme => ({
  divider: {
    paddingTop: 5,
    paddingBottom: 20,
    borderBottom: '1px lightgrey solid',
    '&:last-child': {
      borderBottom: 'none'
    }
  }
}));

const MainList = ({ children, divider, Label }) => {
  const translate = useTranslate();
  const classes = useStyles();
  const { basePath, loaded, record, resource } = useShowContext();
  if (!loaded) return null;

  return (
    <Box>
      {React.Children.map(children, field =>
        field && record[field.props.source] && React.isValidElement(field) ? (
          <div key={field.props.source} className={divider ? classes.divider : null}>
            {field.props.addLabel ? (
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
                {React.cloneElement(field, {
                  record,
                  resource,
                  basePath
                })}
              </>
            ) : typeof field.type === 'string' ? (
              field
            ) : (
              React.cloneElement(field, {
                record,
                resource,
                basePath
              })
            )}
          </div>
        ) : null
      )}
    </Box>
  );
};

MainList.defaultProps = {
  Label: LargeLabel
};

export default MainList;
