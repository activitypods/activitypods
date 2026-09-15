import React, { useEffect, useState, useCallback } from 'react';
import { EditToolbarWithPermissions, useCheckAuthenticated } from '@semapps/auth-provider';
import { email, required, useAuthProvider, useNotify, useTranslate, SimpleForm, TextInput, Form } from 'react-admin';
import { Box, Card, Typography } from '@mui/material';
import ToolbarWithoutDelete from '../../common/ToolbarWithoutDelete';

const validateEmail = [required(), email('app.validation.email')];

const SettingsEmailPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  const { identity } = useCheckAuthenticated();
  const authProvider = useAuthProvider();

  const [formDefaultValue, setFormDefaultValue] = useState({
    email: '',
    currentPassword: ''
  });

  useEffect(() => {
    authProvider!.getAccountSettings().then((res: any) => {
      setFormDefaultValue({ ...formDefaultValue, email: res.email });
    });
  }, [setFormDefaultValue, authProvider]);

  const onSubmit = useCallback(
    async (params: any) => {
      try {
        await authProvider!.updateAccountSettings({ ...params });
        notify('auth.message.account_settings_updated', { type: 'success' });
      } catch (error) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        notify(error.message, { type: 'error' });
      }
    },
    [authProvider, notify]
  );

  if (!identity?.id) return null;

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.settings_email')}
      </Typography>
      <Box mt={1}>
        <Card>
          <SimpleForm defaultValues={formDefaultValue} onSubmit={onSubmit} toolbar={<ToolbarWithoutDelete />}>
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
