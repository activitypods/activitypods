import React, { useCallback, useEffect, useState } from 'react';
import { useCheckAuthenticated, PasswordStrengthIndicator, validatePasswordStrength } from '@semapps/auth-provider';
import { required, useAuthProvider, useNotify, useTranslate, SimpleForm, TextInput } from 'react-admin';
import {
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  Typography
} from '@mui/material';
import scorer from '../../config/scorer';
import { deletePasskey, listPasskeys, registerPasskey } from '../../utils/passkeys';

const validateConfirmNewPassword = [
  (value, { newPassword, confirmNewPassword }) => {
    if (!newPassword) return;
    if (newPassword !== confirmNewPassword) {
      return 'app.validation.confirmNewPassword';
    }
  }
];

const SettingsPasswordPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const { identity } = useCheckAuthenticated();
  const authProvider = useAuthProvider();

  const [newPassword, setNewPassword] = React.useState('');
  const [passkeys, setPasskeys] = useState([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const formatTimestamp = value => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString();
  };

  const loadPasskeys = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setPasskeys([]);
      setPasskeysLoading(false);
      return;
    }

    setPasskeysLoading(true);
    try {
      const data = await listPasskeys(token);
      setPasskeys(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.message || 'Unable to load passkeys.', { type: 'error' });
    } finally {
      setPasskeysLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadPasskeys();
  }, [loadPasskeys]);

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

  const handleRegisterPasskey = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      notify('You need to sign in again before registering a passkey.', { type: 'error' });
      return;
    }

    setPasskeyBusy(true);
    try {
      await registerPasskey(token);
      notify('Passkey saved to your account.', { type: 'success' });
      await loadPasskeys();
    } catch (error) {
      notify(error.message || 'Passkey registration failed.', { type: 'error' });
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleDeletePasskey = async credentialId => {
    const token = localStorage.getItem('token');
    if (!token) {
      notify('You need to sign in again before removing a passkey.', { type: 'error' });
      return;
    }

    setPasskeyBusy(true);
    try {
      await deletePasskey(token, credentialId);
      notify('Passkey removed.', { type: 'success' });
      await loadPasskeys();
    } catch (error) {
      notify(error.message || 'Unable to remove the passkey.', { type: 'error' });
    } finally {
      setPasskeyBusy(false);
    }
  };

  if (!identity?.id) return null;

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
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
            <PasswordStrengthIndicator scorer={scorer} password={newPassword} sx={{ width: '100%' }} />
            <TextInput
              label={translate('app.input.new_password')}
              source="newPassword"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              validate={[validatePasswordStrength(scorer)]}
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
      <Box mt={2}>
        <Card sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Passkeys
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add a passkey so you can sign in without entering your password on this device or another synced device.
          </Typography>
          <Button variant="contained" onClick={handleRegisterPasskey} disabled={passkeyBusy}>
            {passkeyBusy ? 'Waiting for passkey…' : 'Add passkey'}
          </Button>
          <Divider sx={{ my: 3 }} />
          {passkeysLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Loading registered passkeys…</Typography>
            </Box>
          ) : passkeys.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No passkeys are registered for this account yet.
            </Typography>
          ) : (
            <List disablePadding>
              {passkeys.map(passkey => (
                <ListItem
                  key={passkey.credentialId}
                  divider
                  secondaryAction={
                    <Button
                      color="error"
                      onClick={() => handleDeletePasskey(passkey.credentialId)}
                      disabled={passkeyBusy}
                    >
                      Remove
                    </Button>
                  }
                  sx={{ px: 0 }}
                >
                  <ListItemText
                    primary={passkey.deviceType === 'multiDevice' ? 'Synced passkey' : 'Device-bound passkey'}
                    secondary={
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                        <Chip size="small" label={passkey.backedUp ? 'Backed up' : 'Not backed up'} />
                        <Chip
                          size="small"
                          label={
                            formatTimestamp(passkey.lastUsedAt)
                              ? `Last used ${formatTimestamp(passkey.lastUsedAt)}`
                              : 'Not used yet'
                          }
                        />
                        <Chip
                          size="small"
                          label={
                            formatTimestamp(passkey.createdAt)
                              ? `Created ${formatTimestamp(passkey.createdAt)}`
                              : 'Created time unavailable'
                          }
                        />
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Card>
      </Box>
    </>
  );
};

export default SettingsPasswordPage;
