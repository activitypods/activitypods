import React, { useState } from 'react';
import { useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, List } from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import DownloadIcon from '@mui/icons-material/Download';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import CodeIcon from '@mui/icons-material/Code';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsItem from './SettingsItem';

const AdvancedSettingsPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const [developerMode, setDeveloperMode] = useState(!!localStorage.getItem('developer_mode'));

  const switchDeveloperMode = () => {
    if (developerMode) {
      localStorage.removeItem('developer_mode');
      setDeveloperMode(false);
    } else {
      localStorage.setItem('developer_mode', 'true');
      setDeveloperMode(true);
    }
  };

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.settings_advanced')}
      </Typography>
      <Box>
        <List>
          <SettingsItem
            onClick={switchDeveloperMode}
            icon={<CodeIcon />}
            label="app.setting.developer_mode"
            value={developerMode}
          />
          <SettingsItem
            onClick={() => navigate('/settings/export-pod')}
            icon={<StorageIcon />}
            label="app.setting.export"
            actionIcon={<DownloadIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/export-pod')}
            icon={<DeleteIcon color="error" />}
            label="app.setting.delete"
            actionIcon={<HighlightOffIcon color="error" />}
          />
        </List>
      </Box>
    </>
  );
};

export default AdvancedSettingsPage;
