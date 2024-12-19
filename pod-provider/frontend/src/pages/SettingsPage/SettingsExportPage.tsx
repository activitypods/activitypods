import React, { useCallback, useState } from 'react';
import { useLogout, useNotify, useTranslate } from 'react-admin';
import { Box, Card, Typography, Button, Checkbox, FormControlLabel, CircularProgress } from '@mui/material';
import { Download } from '@mui/icons-material';
import { downloadFile } from '../../utils';
import urlJoin from 'url-join';
import useRealmContext from '../../hooks/useRealmContext';

const SettingsExportPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const logout = useLogout();
  const { data } = useRealmContext();
  const [isLoading, setIsLoading] = useState(false);
  const [withBackups, setWithBackups] = useState(false);

  const exportAccount = useCallback(async () => {
    setIsLoading(true);
    const host = new URL(data.id).origin;
    const username = data?.webIdData.preferredUsername;
    const response = await fetch(urlJoin(host, '/.account/', username, '/export', `?withBackups=${withBackups}`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (!(response.status >= 200 && response.status < 300)) {
      notify('app.notification.export_failed', { messageArgs: { error: response.statusText }, type: 'error' });
      setIsLoading(false);
      return;
    } else {
      downloadFile(await response.blob(), 'data.zip');
      setIsLoading(false);
    }
  }, [notify, logout, data, withBackups]);

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.export_pod')}
      </Typography>
      <Box mt={1}>
        <Card sx={{ padding: 2 }}>
          <Box>
            <Typography variant="body1">{translate('app.description.export_pod')}</Typography>
          </Box>
          <Box mt={1}>
            <FormControlLabel
              label={translate('app.input.with_backups')}
              control={<Checkbox checked={withBackups} onChange={e => setWithBackups(e.target.checked)} />}
            />
          </Box>
          <Box mt={1}>
            <Button
              startIcon={<Download />}
              endIcon={isLoading && <CircularProgress sx={{ scale: '0.7' }} />}
              variant="contained"
              color="primary"
              onClick={() => exportAccount()}
              disabled={isLoading}
            >
              {translate('app.action.export_pod')}
            </Button>
          </Box>
        </Card>
      </Box>
    </>
  );
};

export default SettingsExportPage;
