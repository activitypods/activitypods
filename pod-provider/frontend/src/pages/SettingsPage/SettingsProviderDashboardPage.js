import React, { useEffect, useState } from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { Box, Typography, List, Paper, Stack, Skeleton } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import AnnouncementIcon from '@mui/icons-material/Announcement';
import GroupIcon from '@mui/icons-material/Group';
import GavelIcon from '@mui/icons-material/Gavel';
import MailIcon from '@mui/icons-material/Mail';
import PublicIcon from '@mui/icons-material/Public';
import TuneIcon from '@mui/icons-material/Tune';
import HistoryIcon from '@mui/icons-material/History';
import Header from '../../common/Header';
import SettingsItem from './SettingsItem';
import { dashboardApi } from './dashboardApi';

const StatCard = ({ label, value, loading }) => (
  <Paper variant="outlined" sx={{ p: 2, minWidth: 120, textAlign: 'center', borderRadius: 2 }}>
    {loading ? (
      <Skeleton variant="text" width={40} sx={{ mx: 'auto' }} />
    ) : (
      <Typography variant="h5" fontWeight={700}>
        {value ?? '—'}
      </Typography>
    )}
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
  </Paper>
);

const SettingsProviderDashboardPage = () => {
  useCheckAuthenticated();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [defaultModerationSource, setDefaultModerationSource] = useState(null);

  useEffect(() => {
    dashboardApi
      .getProviderStats()
      .then(s => setStats(s))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));

    dashboardApi
      .getProviderDefaultModerationSourceStatus()
      .then(result => setDefaultModerationSource(result?.data || null))
      .catch(() => setDefaultModerationSource(null));
  }, []);

  return (
    <>
      <Header title="app.titles.settings" />
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        Pod provider dashboard
      </Typography>
      <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>
        Manage moderation, blocked-image policy, trust sources, provider-level federation controls, announcements, and
        invitations.
      </Typography>

      {/* Stats summary */}
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
        <StatCard label="Total pods" value={stats?.pods?.total} loading={statsLoading} />
        <StatCard label="New this week" value={stats?.pods?.newThisWeek} loading={statsLoading} />
        <StatCard label="Announcements" value={stats?.announcements} loading={statsLoading} />
        <StatCard label="Active invites" value={stats?.activeInvitations} loading={statsLoading} />
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Default Moderation Service
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Provider moderation defaults to Bluesky-managed moderation to reduce operational and legal risk.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Status: {defaultModerationSource?.exists ? 'Active' : 'Not seeded'}
        </Typography>
        <Typography variant="body2">
          Source: {defaultModerationSource?.source || 'did:plc:ar7c4by46qjdydhdevvrndac'}
        </Typography>
        <Typography variant="body2">Immutable: {defaultModerationSource?.immutable ? 'Yes' : 'No'}</Typography>
      </Paper>

      <Box>
        <List>
          <SettingsItem
            onClick={() => navigate('/settings/provider/moderation')}
            icon={<GavelIcon />}
            label="app.setting.provider_moderation"
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/trust-sources')}
            icon={<PublicIcon />}
            label="app.setting.trust_sources"
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/provider/pods')}
            icon={<GroupIcon />}
            label="app.setting.provider_pods"
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/provider/invitations')}
            icon={<MailIcon />}
            label="app.setting.provider_invitations"
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/provider/announcements')}
            icon={<AnnouncementIcon />}
            label="app.setting.provider_announcements"
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/provider/audit-log')}
            icon={<HistoryIcon />}
            label="app.setting.provider_audit_log"
            actionIcon={<ArrowForwardIosIcon />}
          />
          <SettingsItem
            onClick={() => navigate('/settings/advanced')}
            icon={<TuneIcon />}
            label="app.page.settings_advanced"
            actionIcon={<ArrowForwardIosIcon />}
          />
        </List>
      </Box>
    </>
  );
};

export default SettingsProviderDashboardPage;
