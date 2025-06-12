import React from 'react';
import { SimpleForm, TextInput, useTranslate, Toolbar, SaveButton } from 'react-admin';
import { Box, Card, Typography, Alert } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import SendIcon from '@mui/icons-material/Send';
import useRequestContact from '../../hooks/useRequestContact';

const AddContactToolbar = props => {
  const translate = useTranslate();
  return (
    <Toolbar {...props}>
      <SaveButton
        icon={<SendIcon />}
        label={translate('app.action.send_request')}
        aria-label={translate('app.action.send_request')}
        variant="contained"
        color="secondary"
      />
    </Toolbar>
  );
};

const NetworkRequestPage = () => {
  useCheckAuthenticated();
  const requestContact = useRequestContact();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const translate = useTranslate();

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.add_contact')}
      </Typography>
      <Box mt={1}>
        <Card>
          <SimpleForm
            defaultValues={{ id: searchParams.get('id') }}
            onSubmit={requestContact}
            toolbar={<AddContactToolbar />}
          >
            <Alert severity="info" sx={{ width: '100%' }}>
              {translate('app.helper.add_contact')}
            </Alert>
            <br />
            <TextInput
              source="id"
              label={translate('app.input.user_id')}
              helperText={translate('app.helper.user_id')}
              placeholder={translate('app.placeholder.user_id')}
              aria-describedby="user-id-helper-text"
              fullWidth
            />
            <TextInput
              source="content"
              label={translate('app.input.about_you')}
              helperText={translate('app.helper.about_you')}
              placeholder={translate('app.placeholder.about_you')}
              aria-describedby="about-you-helper-text"
              fullWidth
            />
          </SimpleForm>
        </Card>
      </Box>
    </>
  );
};

export default NetworkRequestPage;
