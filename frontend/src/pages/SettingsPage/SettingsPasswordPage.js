import React, { useCallback } from 'react';
import {
  useCheckAuthenticated,
  defaultPasswordScorer,
  PasswordStrengthIndicator,
  validatePasswordStrength
} from '@semapps/auth-provider';
import { required, useAuthProvider, useNotify, useTranslate } from 'react-admin';
import { SimpleForm, TextInput } from 'react-admin';
import { Box, Card, Typography } from '@mui/material';

const validateConfirmNewPassword = [
  (value, { newPassword, confirmNewPassword }) => {
    if (!newPassword) return;
    if (newPassword !== confirmNewPassword) {
      return 'app.validation.confirmNewPassword';
    }
    return;
  }
];

const SettingsPasswordPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const { identity } = useCheckAuthenticated();
  const authProvider = useAuthProvider();

  const [newPassword, setNewPassword] = React.useState('');

  const onSubmit = useCallback(
    async params => {
      try {
        await authProvider.updateAccountSettings({ ...params });
        notify('auth.message.account_settings_updated', 'success');
      } catch (error) {
        notify(error.message, { type: 'error' });
      }
    },
    [authProvider, notify]
  );

  if (!identity?.id) return null;

  return (
    <>
      <Typography variant="h2" component="h1">
        {translate('app.page.settings_password')}
      </Typography>
      <Box mt={1}>
        <Card>
          <SimpleForm onSubmit={onSubmit}>
            <TextInput
              label={translate('app.input.current_password')}
              source="currentPassword"
              type="password"
              validate={required()}
              fullWidth
            />

            <Typography variant="body2" style={{ marginBottom: 3 }}>
              {translate('app.validation.password_strength')}:{' '}
            </Typography>
            <PasswordStrengthIndicator scorer={defaultPasswordScorer} password={newPassword} sx={{ width: '100%' }} />
            <TextInput
              label={translate('app.input.new_password')}
              source="newPassword"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              validate={[validatePasswordStrength()]}
              fullWidth
            />

            <TextInput
              label={translate('app.input.confirm_new_password')}
              source="confirmNewPassword"
              type="password"
              validate={validateConfirmNewPassword}
              fullWidth
            />
          </SimpleForm>
        </Card>
      </Box>
    </>
  );
};

export default SettingsPasswordPage;
