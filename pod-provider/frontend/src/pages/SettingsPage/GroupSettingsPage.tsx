import React, { useState } from 'react';
import { useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, List } from '@mui/material';
import Header from '../../common/Header';
import StorageIcon from '@mui/icons-material/Storage';
import DownloadIcon from '@mui/icons-material/Download';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import DeleteIcon from '@mui/icons-material/Delete';
import GroupIcon from '@mui/icons-material/PeopleAlt';
import BadgeIcon from '@mui/icons-material/Badge';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import SettingsItem from './SettingsItem';
import JoinPolicyDialog from './JoinPolicyDialog';
import useGroupContext from '../../hooks/useRealmContext';
import useGroupRights from '../../hooks/useGroupRights';

const GroupSettingsPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  // @ts-expect-error TS(2339): Property 'isLoading' does not exist on type 'unkno... Remove this comment to see the full error message
  const { isLoading, data, refetch } = useGroupContext();
  const { isLoading: isRightsLoading, isOwner, rights } = useGroupRights();
  const [joinPolicyOpen, setJoinPolicyOpen] = useState(false);

  if (isLoading || isRightsLoading) return null;

  return (
    <>
      <Header
        title="app.titles.group_settings"
        // @ts-expect-error TS(2322): Type '{ title: string; titleVariables: { groupName... Remove this comment to see the full error message
        titleVariables={{
          groupName: data.fullName
        }}
      />
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.settings')}
      </Typography>
      <Box>
        <List>
          {isOwner && (
            <SettingsItem
              onClick={() => navigate(`/group/${data.webfingerId}/settings/profile`)}
              icon={<GroupIcon />}
              label="app.setting.public_profile"
              value={data.fullName}
            />
          )}
          {rights.includes('interop:ChangeJoinPolicy') && (
            <SettingsItem
              onClick={() => setJoinPolicyOpen(true)}
              icon={<HowToRegIcon />}
              label="app.setting.join_policy"
              value={translate(
                `app.join_policy.${(data.webIdData['interop:joinPolicy'] || 'interop:InviteOnly').split(':')[1]}`
              )}
            />
          )}
          {rights.includes('interop:ReadMembers') && (
            <SettingsItem
              onClick={() => navigate(`/group/${data.webfingerId}/settings/roles`)}
              icon={<BadgeIcon />}
              label="app.setting.roles"
            />
          )}
          {isOwner && (
            <SettingsItem
              onClick={() => navigate(`/group/${data.webfingerId}/settings/export`)}
              icon={<StorageIcon />}
              label="app.setting.export"
              actionIcon={<DownloadIcon />}
            />
          )}
          {isOwner && (
            <SettingsItem
              onClick={() => navigate(`/group/${data.webfingerId}/settings/delete`)}
              icon={<DeleteIcon color="error" />}
              label="app.setting.delete"
              actionIcon={<HighlightOffIcon color="error" />}
            />
          )}
        </List>
      </Box>
      <JoinPolicyDialog open={joinPolicyOpen} group={data} onClose={() => setJoinPolicyOpen(false)} onSaved={refetch} />
    </>
  );
};

export default GroupSettingsPage;
