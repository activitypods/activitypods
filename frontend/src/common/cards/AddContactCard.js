import React from 'react';
import { makeStyles, Box, Card, Typography, Button, TextField } from '@material-ui/core';
import { Field, Form } from 'react-final-form';
import { useTranslate } from 'react-admin';
import useRequestContact from '../../hooks/useRequestContact';

const useStyles = makeStyles(theme => ({
  root: {
    marginTop: 5,
    marginBottom: 24
  },
  title: {
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 8em, ${theme.palette.primary.main} 0%, ${theme.palette.primary.main} 100%)`,
    color: theme.palette.primary.contrastText,
    padding: '10px 14px',
    [theme.breakpoints.down('sm')]: {
      padding: '8px 16px'
    }
  },
  block: {
    backgroundColor: 'white'
  },
  button: {
    backgroundColor: 'white',
    textAlign: 'center'
  },
  status: {
    marginTop: 8,
    color: theme.palette.primary.main
  },
  helper: {
    marginBottom: 4
  }
}));

const Input = ({ meta: { touched, error }, input: inputProps, ...props }) => (
  <TextField
    error={!!(touched && error)}
    helperText={touched && error}
    variant="filled"
    margin="dense"
    {...inputProps}
    {...props}
    fullWidth
  />
);

const AddContactCard = () => {
  const classes = useStyles();
  const requestContact = useRequestContact();
  const translate = useTranslate();
  return (
    <Card className={classes.root}>
      <Form
        onSubmit={requestContact}
        render={({ handleSubmit }) => (
          <form onSubmit={handleSubmit}>
            <Box className={classes.title} p={2}>
              <Typography variant="h6">{translate('app.card.add_contact')}</Typography>
            </Box>
            <Box className={classes.block} p={2}>
              <Typography variant="body2" className={classes.helper}>
                {translate('app.helper.add_contact')}
              </Typography>
              <Field id="id" name="id" component={Input} label={translate('app.input.user_id')} />
              <br />
              <Field id="content" name="content" component={Input} label={translate('app.input.about_you')} />
            </Box>
            <Box className={classes.button} pb={3} pr={3} pl={3}>
              <Button variant="contained" color="primary" type="submit">
                {translate('app.action.send')}
              </Button>
            </Box>
          </form>
        )}
      />
    </Card>
  );
};

export default AddContactCard;
