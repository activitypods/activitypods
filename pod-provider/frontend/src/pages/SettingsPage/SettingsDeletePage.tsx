import React, { useCallback, useState } from 'react';
import urlJoin from 'url-join';
import { useLogout, useNotify, useTranslate } from 'react-admin';
import { Box, Card, Typography, TextField, Button, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import useRealmContext from '../../hooks/useRealmContext';

const SettingsDeletePage = () => {
  const translate = useTranslate();
  const logout = useLogout();
  const navigate = useNavigate();
  const notify = useNotify();
  // @ts-expect-error TS(2339): Property 'data' does not exist on type 'unknown'.
  const { data, isGroup } = useRealmContext();
  const [confirmInput, setConfirmInput] = useState('');
  const [deletedClicked, setDeletedClicked] = useState(false);

  const deleteAccount = useCallback(async () => {
    setDeletedClicked(true);
    const host = new URL(data.id).origin;
    const username = data.webIdData.preferredUsername;

    await fetch(urlJoin(host, '/.account/', username), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });

    if (isGroup) {
      window.location.href = '/network';
    } else {
      logout();
    }
  }, [setDeletedClicked, data, isGroup, navigate, notify, logout]);

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.delete_pod')}
      </Typography>
      <Box mt={1}>
        <Card sx={{ padding: 2 }}>
          <Typography variant="body1">
            {translate('app.description.delete_pod', {
              confirm_text: translate('app.description.delete_pod_confirm_text')
            })}
          </Typography>
          <TextField
            sx={{ mt: 1 }}
            label={translate('app.input.confirm_delete')}
            type="text"
            value={confirmInput}
            onChange={e => setConfirmInput(e.target.value)}
            fullWidth
          />
          <Button
            sx={{ mt: 1 }}
            disabled={deletedClicked || confirmInput !== translate('app.description.delete_pod_confirm_text')}
            variant="contained"
            color="error"
            onClick={() => deleteAccount()}
            endIcon={deletedClicked && <CircularProgress sx={{ scale: '0.7' }} />}
          >
            {translate('app.action.delete_pod')}
          </Button>
        </Card>
      </Box>
    </>
  );
};

export default SettingsDeletePage;
