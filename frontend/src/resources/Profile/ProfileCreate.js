import React from 'react';
import { SimpleForm, TextInput, useTranslate, Toolbar, SaveButton } from 'react-admin';
import { Box, Card, Typography } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import { useLocation } from 'react-router-dom';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import useRequestContact from '../../hooks/useRequestContact';
import SendIcon from '@material-ui/icons/Send';

const AddContactToolbar = props => {
  const translate = useTranslate();
  return (
    <Toolbar {...props}>
      <SaveButton
        icon={<SendIcon />}
        label={translate('app.action.add_contact')}
        variant="contained"
        color="secondary"
      />
    </Toolbar>
  );
};

const ProfileCreate = () => {
  useCheckAuthenticated();
  const requestContact = useRequestContact();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const translate = useTranslate();

  return (
    <>
      <Typography variant="h2" component="h1">
        {translate('app.page.add_contact')}
      </Typography>
      <Box mt={1}>
        <Card>
          <SimpleForm
            initialValues={{ id: searchParams.get('id') }}
            save={requestContact}
            toolbar={<AddContactToolbar />}
          >
            <Alert severity="info" fullWidth>
              {translate('app.helper.add_contact')}
            </Alert>
            <br />
            <TextInput source="id" label={translate('app.input.user_id')} fullWidth />
            <TextInput source="content" label={translate('app.input.about_you')} fullWidth />
          </SimpleForm>
        </Card>
      </Box>
    </>
  );
};

export default ProfileCreate;
