import React, { useCallback, useState } from 'react';
import { useGetIdentity, useLogout, useNotify, useTranslate } from 'react-admin';
import { Box, Card, Typography, TextField, Button, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import urlJoin from 'url-join';

const SettingsDeletePodPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const logout = useLogout();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity();

  const [confirmInput, setConfirmInput] = React.useState('');
  const [deletedClicked, setDeletedClicked] = useState(false);

  const onDeletePod = useCallback(() => {
    setDeletedClicked(true);
    const token = localStorage.getItem('token');
    const webId = encodeURIComponent(String(identity?.id));

    fetch(urlJoin(CONFIG.BACKEND_URL || '', '/.management/actor/', webId, '?iKnowWhatImDoing=true'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    }).then(() => logout());
  }, [notify, navigate, logout]);

  return (
    <>
      <Typography variant="h2" component="h1">
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
            onClick={() => onDeletePod()}
            endIcon={deletedClicked && <CircularProgress sx={{ scale: '0.7' }} />}
          >
            {translate('app.action.delete_pod')}
          </Button>
        </Card>
      </Box>
    </>
  );
};

export default SettingsDeletePodPage;
