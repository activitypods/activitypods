import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { Alert, Box, Button, Checkbox, FormControlLabel, TextField, Typography } from '@mui/material';
import { useAuthProvider, useNotify, useTranslate } from 'react-admin';
import Header from '../../common/Header';

const defaultPdsUrl = 'https://bsky.social';

const getWebIdFromToken = () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return undefined;
    const parts = token.split('.');
    if (parts.length < 2) return undefined;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload?.webid || payload?.webId || payload?.sub || undefined;
  } catch (_error) {
    return undefined;
  }
};

const SettingsAtprotoLinkPage = () => {
  useCheckAuthenticated();
  const authProvider = useAuthProvider();
  const notify = useNotify();
  const translate = useTranslate();

  const [accountSettings, setAccountSettings] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [pdsUrl, setPdsUrl] = useState(defaultPdsUrl);
  const [identifier, setIdentifier] = useState('');
  const [did, setDid] = useState('');
  const [handle, setHandle] = useState('');
  const [sendLoginHint, setSendLoginHint] = useState(true);
  const [password, setPassword] = useState('');

  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const linked = search.get('linked') === '1';
  const linkedDid = search.get('did') || '';

  useEffect(() => {
    authProvider
      .getAccountSettings()
      .then(res => setAccountSettings(res))
      .catch(() => {
        const webId = getWebIdFromToken();
        if (webId) {
          setAccountSettings({ webId });
        }
      });
  }, [authProvider]);

  const startLinkFlow = useCallback(async () => {
    if (!password || password.length < 8) {
      notify('app.notification.atproto_link_password_required', { type: 'warning' });
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const redirectAfterLink = `${window.location.origin}/settings/atproto-link`;
      const response = await fetch(`${CONFIG.BACKEND_URL}/api/accounts/link-atproto/oauth/start`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          activitypods: {
            canonicalAccountId: accountSettings?.webId || accountSettings?.id,
            username: accountSettings?.username,
            email: accountSettings?.email,
            password
          },
          atproto: {
            pdsUrl: pdsUrl.trim(),
            identifier: sendLoginHint ? identifier.trim() || undefined : undefined,
            did: did.trim() || undefined,
            handle: handle.trim() || undefined
          },
          redirectAfterLink
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.authorizationUrl) {
        const safeError =
          payload?.message || payload?.error || translate('app.notification.atproto_link_start_failed_generic');
        throw new Error(String(safeError));
      }

      window.location.assign(payload.authorizationUrl);
    } catch (error) {
      const message = String(error?.message || translate('app.notification.atproto_link_start_failed_generic'));
      setErrorMessage(message);
      notify('app.notification.atproto_link_start_failed', {
        type: 'error',
        messageArgs: { error: message }
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [password, notify, pdsUrl, identifier, did, handle, accountSettings, translate]);

  return (
    <>
      <Header title="app.titles.settings" />
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2, mb: 2 }}>
        {translate('app.page.settings_atproto_link')}
      </Typography>

      {linked && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {translate('app.notification.atproto_link_success')}
          {linkedDid ? ` (${linkedDid})` : ''}
        </Alert>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2, maxWidth: 720, backgroundColor: 'white', p: 2, borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {translate('app.helper.atproto_link')}
        </Typography>

        <Alert severity="info" sx={{ mb: 1 }}>
          {translate('app.helper.atproto_link_passwords')}
        </Alert>

        <TextField
          label={translate('app.input.atproto_pds_url')}
          value={pdsUrl}
          onChange={event => setPdsUrl(event.target.value)}
          autoComplete="url"
          fullWidth
        />

        <TextField
          label={translate('app.input.atproto_identifier_optional')}
          value={identifier}
          onChange={event => setIdentifier(event.target.value)}
          autoComplete="username"
          helperText={translate('app.helper.atproto_link_identifier_hint')}
          fullWidth
        />

        <FormControlLabel
          control={<Checkbox checked={sendLoginHint} onChange={event => setSendLoginHint(event.target.checked)} />}
          label={translate('app.helper.atproto_link_send_login_hint')}
        />

        <TextField
          label={translate('app.input.atproto_did_optional')}
          value={did}
          onChange={event => setDid(event.target.value)}
          autoComplete="off"
          fullWidth
        />

        <TextField
          label={translate('app.input.atproto_handle_optional')}
          value={handle}
          onChange={event => setHandle(event.target.value)}
          autoComplete="username"
          fullWidth
        />

        <TextField
          label={translate('app.input.atproto_link_activitypods_password')}
          value={password}
          onChange={event => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          helperText={translate('app.helper.atproto_link_activitypods_password')}
          fullWidth
        />

        <Button variant="contained" onClick={startLinkFlow} disabled={isSubmitting}>
          {isSubmitting ? translate('app.action.atproto_link_starting') : translate('app.action.continue_to_bluesky')}
        </Button>
      </Box>
    </>
  );
};

export default SettingsAtprotoLinkPage;
