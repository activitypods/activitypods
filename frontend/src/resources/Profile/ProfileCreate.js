import React from 'react';
import { Container, TextField, Button } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import { Form, Field } from 'react-final-form';
import { useLocation } from 'react-router-dom';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import HeaderTitle from '../../layout/HeaderTitle';
import useRequestContact from '../../hooks/useRequestContact';
import { useTranslate } from 'react-admin';

const Input = ({ meta: { touched, error }, input: inputProps, ...props }) => (
  <TextField
    error={!!(touched && error)}
    helperText={touched && error}
    variant="filled"
    {...inputProps}
    {...props}
    fullWidth
  />
);

const ProfileCreate = () => {
  useCheckAuthenticated();
  const requestContact = useRequestContact();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const translate = useTranslate();

  return (
    <>
      <HeaderTitle>{translate('app.card.add_contact')}</HeaderTitle>
      <Container>
        <br />
        <Alert severity="info">{translate('app.helper.add_contact')}</Alert>
        <Form
          onSubmit={requestContact}
          initialValues={{ id: searchParams.get('id') }}
          render={({ handleSubmit }) => (
            <form onSubmit={handleSubmit}>
              <br />
              <Field id="id" name="id" component={Input} label={translate('app.input.user_id')} />
              <br />
              <br />
              <Field id="content" name="content" component={Input} label={translate('app.input.about_you')} />
              <br />
              <br />
              <Button variant="contained" color="primary" type="submit">
                {translate('app.action.send')}
              </Button>
            </form>
          )}
        />
      </Container>
    </>
  );
};

export default ProfileCreate;
