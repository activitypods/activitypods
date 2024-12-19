import React from 'react';
import { useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, List } from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import DownloadIcon from '@mui/icons-material/Download';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import DeleteIcon from '@mui/icons-material/Delete';
import GroupIcon from '@mui/icons-material/PeopleAlt';
import SettingsItem from './SettingsItem';
import useGroupContext from '../../hooks/useRealmContext';

const GroupSettingsPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const { isLoading, data } = useGroupContext();

  if (isLoading) return null;

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.settings')}
      </Typography>
      <Box>
        <List>
          <SettingsItem
            onClick={() => navigate(`/group/${data.webfingerId}/settings/profile`)}
            icon={<GroupIcon />}
            label="app.setting.public_profile"
            value={data.fullName}
          />
          <SettingsItem
            onClick={() => navigate(`/group/${data.webfingerId}/settings/export`)}
            icon={<StorageIcon />}
            label="app.setting.export"
            actionIcon={<DownloadIcon />}
          />
          <SettingsItem
            onClick={() => navigate(`/group/${data.webfingerId}/settings/delete`)}
            icon={<DeleteIcon color="error" />}
            label="app.setting.delete"
            actionIcon={<HighlightOffIcon color="error" />}
          />
        </List>
      </Box>
    </>
  );
};

export default GroupSettingsPage;
