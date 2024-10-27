import React, { useCallback, useState } from 'react';
import { useGetIdentity, useLogout, useNotify, useTranslate } from 'react-admin';
import { Box, Card, Typography, Button, Checkbox, FormControlLabel, CircularProgress } from '@mui/material';
import { Download } from '@mui/icons-material';
import { downloadFile } from '../../utils';
import urlJoin from 'url-join';

const SettingsExportPodPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const logout = useLogout();
  const { data: identity } = useGetIdentity();
  const [isLoading, setIsLoading] = useState(false);
  const [withBackups, setWithBackups] = useState(false);

  const onExportPod = useCallback(async () => {
    const token = localStorage.getItem('token');
    const webId = encodeURIComponent(String(identity?.id));
    setIsLoading(true);
    await fetch(
      urlJoin(CONFIG.BACKEND_URL || '', '/.management/actor/', webId, '/export', `?withBackups=${withBackups}`),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }
    ).then(async res => {
      if (!(res.status >= 200 && res.status < 300)) {
        notify(translate('app.notification.export_failed', { error: res.statusText }), { type: 'error' });
        setIsLoading(false);
        return;
      }
      downloadFile(await res.blob(), 'pod.zip');
      setIsLoading(false);
    });
  }, [notify, logout, identity, withBackups]);

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
              onClick={() => onExportPod()}
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

export default SettingsExportPodPage;
