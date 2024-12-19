import React, { useState } from 'react';
import { useTranslate, useGetIdentity, useCreatePath } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, List } from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsItem from '../SettingsItem';

const SettingsProfilesPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.settings_profiles')}
      </Typography>
      <Box>
        <List>
          <SettingsItem
            onClick={() => navigate('/settings/profiles/private')}
            icon={<SecurityIcon />}
            label="app.setting.private_profile"
            value={translate('app.setting.private_profile_desc')}
          />
          <SettingsItem
            onClick={() => navigate('/settings/profiles/public')}
            icon={<PublicIcon />}
            label="app.setting.public_profile"
            value={translate('app.setting.public_profile_desc')}
          />
        </List>
      </Box>
    </>
  );
};

export default SettingsProfilesPage;
