import React, { useEffect, useState } from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { useTranslate } from 'react-admin';
import { Box, Typography, List, Alert, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import Header from '../../common/Header';
import SettingsItem from './SettingsItem';

const SettingsPage = () => {
  useCheckAuthenticated();
  const translate = useTranslate();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    navigate('/settings/owner', { replace: true });
    setLoading(false);
  }, [navigate]);

  if (loading) {
    return (
      <>
        <Header title="app.titles.settings" />
        <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
          {translate('app.page.settings')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 3, gap: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">{translate('app.setting.loading_dashboard')}</Typography>
        </Box>
      </>
    );
  }

  return (
    <>
      <Header title="app.titles.settings" />
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.settings')}
      </Typography>
      {showFallback && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {translate('app.setting.role_fallback')}
        </Alert>
      )}
      <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>
        Opening your role dashboard...
      </Typography>
      <Box>
        <List>
          <SettingsItem
            onClick={() => navigate('/settings/owner')}
            icon={<DashboardIcon />}
            label="app.setting.owner_dashboard"
            value={translate('app.setting.owner_dashboard_description')}
            actionIcon={<ArrowForwardIosIcon />}
          />
        </List>
      </Box>
    </>
  );
};

export default SettingsPage;
