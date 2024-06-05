import React, { useEffect, useState, useCallback } from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { email, required, useAuthProvider, useNotify, useTranslate, SimpleForm, TextInput } from 'react-admin';
import { Box, Card, Typography } from '@mui/material';

const validateEmail = [required(), email('app.validation.email')];

const SettingsEmailPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const { identity } = useCheckAuthenticated();
  const authProvider = useAuthProvider();

  const [formDefaultValue, setFormDefaultValue] = useState({
    email: '',
    currentPassword: ''
  });

  useEffect(() => {
    authProvider.getAccountSettings().then(res => {
      setFormDefaultValue({ ...formDefaultValue, email: res.email });
    });
  }, [setFormDefaultValue, authProvider]);

  const onSubmit = useCallback(
    async params => {
      try {
        await authProvider.updateAccountSettings({ ...params });
        notify('auth.message.account_settings_updated', { type: 'success' });
      } catch (error) {
        notify(error.message, { type: 'error' });
      }
    },
    [authProvider, notify]
  );

  if (!identity?.id) return null;

  return (
    <>
      <Typography variant="h2" component="h1" sx={{ mt: 2 }}>
        {translate('app.page.settings_email')}
      </Typography>
      <Box mt={1}>
        <Card>
          <SimpleForm defaultValues={formDefaultValue} onSubmit={onSubmit}>
            <TextInput
              label={translate('app.input.email')}
              source="email"
              type="email"
              validate={validateEmail}
              fullWidth
            />
            <TextInput
              label={translate('app.input.current_password')}
              source="currentPassword"
              type="password"
              validate={required()}
              autoComplete="off"
              fullWidth
            />
          </SimpleForm>
        </Card>
      </Box>
    </>
  );
};

export default SettingsEmailPage;
