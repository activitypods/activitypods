import React from 'react';
import { ListButton, ShowButton, useEditContext } from 'react-admin';
import { Box, Typography, Grid, Card } from '@mui/material';

const EditView = (props) => {
  const {
    record,
    redirect,
    resource,
    save,
    saving,
    version
  } = useEditContext(props);
  return(
    <>
      <Grid container sx={{ mt: 2 }}>
        <Grid item xs={8}>
          <Typography variant="h2" component="h1">
            {props.title}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Box display="flex" alignItems="middle" justifyContent="right">
            {props.actions.map((action, key) => React.cloneElement(action, { key, color: 'primary' }))}
          </Box>
        </Grid>
      </Grid>
      <Box mt={1}>
        <Card>
          {record ? React.cloneElement(React.Children.only(props.children), {
            record,
            redirect:
              typeof props.children.props.redirect === 'undefined'
                ? redirect
                : props.children.props.redirect,
            resource,
            save:
              typeof props.children.props.save === 'undefined'
                ? save
                : props.children.props.save,
            saving,
            undoable: props.undoable,
            mutationMode: props.mutationMode,
            version,
          }) : null}
        </Card>
      </Box>
    </>
  )
};

EditView.defaultProps = {
  actions: [
    <ListButton />,
    <ShowButton />
  ]
};

export default EditView;
