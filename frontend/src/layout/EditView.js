import React from 'react';
import { ListButton, ShowButton, useEditContext } from 'react-admin';
import { Box, Typography, Grid, Card } from '@material-ui/core';

const EditView = props => {
  const { basePath, record, redirect, resource, save, saving, version } = useEditContext(props);
  return (
    <>
      <Grid container>
        <Grid item xs={8}>
          <Typography variant="h2" component="h1">
            {props.title && React.cloneElement(props.title, { record })}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Box display="flex" alignItems="middle" justifyContent="right">
            {props.actions.map((action, key) => React.cloneElement(action, { key, color: 'text', record }))}
          </Box>
        </Grid>
      </Grid>
      <Box mt={1}>
        <Card>
          {record
            ? React.cloneElement(React.Children.only(props.children), {
                basePath,
                record,
                redirect:
                  typeof props.children.props.redirect === 'undefined' ? redirect : props.children.props.redirect,
                resource,
                save: typeof props.children.props.save === 'undefined' ? save : props.children.props.save,
                saving,
                undoable: props.undoable,
                mutationMode: props.mutationMode,
                version
              })
            : null}
        </Card>
      </Box>
    </>
  );
};

EditView.defaultProps = {
  actions: [<ListButton />, <ShowButton />]
};

export default EditView;
