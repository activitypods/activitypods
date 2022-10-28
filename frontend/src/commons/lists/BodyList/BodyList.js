import React from 'react';
import { useTranslate, getFieldLabelTranslationArgs, useShowContext } from 'react-admin';
import { Box, Grid, Hidden, makeStyles, Container } from '@material-ui/core';
import BodyLabel from './BodyLabel';
import StickyBox from "../../cards/StickyBox";

const useStyles = makeStyles((theme) => ({
  divider: {
    paddingTop: 5,
    paddingBottom: 5,
  },
}));

const BodyList = ({ children, aside }) => {
  const translate = useTranslate();
  const classes = useStyles();
  const { basePath, loaded, record, resource } = useShowContext();
  if (!loaded) return null;

  const fields = React.Children.toArray(children).filter(
    (field) => field && record[field.props.source] && React.isValidElement(field)
  );

  return (
    <Box pt={3} pb={{ xs: 10, sm: 6 }}>
      <Container>
        <Grid container spacing={3}>
          <Grid item xs={12} md={aside ? 8 : 12} lg={aside ? 9 : 12}>
            {fields.map((field, i) => (
              <div key={i} id={field.props.source} className={classes.divider}>
                {field.props.addLabel ? (
                  <>
                    <BodyLabel first={i === 0}>
                      {translate(
                        ...getFieldLabelTranslationArgs({
                          label: typeof field.props.label === 'function' ? field.props.label(record) : field.props.label,
                          resource,
                          source: field.props.source,
                        })
                      )}
                    </BodyLabel>
                    {React.cloneElement(field, {
                      record,
                      resource,
                      basePath,
                    })}
                  </>
                ) : typeof field.type === 'string' ? (
                  field
                ) : (
                  React.cloneElement(field, {
                    record,
                    resource,
                    basePath,
                  })
                )}
              </div>
            ))}
          </Grid>
          {aside &&
            <Hidden smDown>
              <Grid item md={4} lg={3}>
                <StickyBox>
                  {aside}
                </StickyBox>
              </Grid>
            </Hidden>
          }
        </Grid>
      </Container>
    </Box>
  );
};

export default BodyList;
