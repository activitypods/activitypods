import React, { useEffect } from 'react';
import { useTranslate } from 'react-admin';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { Avatar, Box, CircularProgress, List, ListItemAvatar, ListItemButton, ListItemText } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import GroupIcon from '@mui/icons-material/PeopleAlt';
import Header from '../common/Header';
import SimpleBox from '../layout/SimpleBox';
import useGroups, { Group } from '../hooks/useGroups';
import { isURL } from '../utils';

// Choose a group managed by the user, or create a new one
const SelectGroupPage = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useCheckAuthenticated();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const { groups, isLoading } = useGroups();

  // Apps can only be registered on groups of this server
  const managedGroups = groups.filter(
    group => group.id.startsWith(CONFIG.BACKEND_URL) && group.rights.specialRights.includes('interop:ManageAccess')
  );

  const createGroupUrl = `/groups/create?${searchParams.toString()}`;

  useEffect(() => {
    if (!isLoading && managedGroups.length === 0) navigate(createGroupUrl, { replace: true });
  }, [isLoading, managedGroups.length, createGroupUrl, navigate]);

  const selectGroup = (group: Group) => {
    if (isURL(redirect)) {
      const redirectUrl = new URL(redirect!);
      redirectUrl.searchParams.set('group', group.id);
      window.location.href = redirectUrl.toString();
    } else {
      navigate(`/network/${group.webfingerId}`);
    }
  };

  return (
    <>
      <Header title="app.titles.select_group" />
      <SimpleBox
        title={translate('app.action.select_group')}
        icon={<GroupIcon />}
        text={translate('app.helper.select_group')}
      >
        {isLoading || managedGroups.length === 0 ? (
          <Box display="flex" justifyContent="center" sx={{ p: 2 }}>
            <CircularProgress />
          </Box>
        ) : (
          <List>
            {managedGroups.map(group => (
              <ListItemButton
                key={group.id}
                onClick={() => selectGroup(group)}
                sx={{ backgroundColor: 'white', mb: 1, boxShadow: 1 }}
              >
                <ListItemAvatar>
                  <Avatar src={group.avatar}>
                    <GroupIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={group.name} secondary={group.webfingerId} />
              </ListItemButton>
            ))}
            <ListItemButton
              onClick={() => navigate(createGroupUrl)}
              sx={{ backgroundColor: 'white', mb: 1, boxShadow: 1 }}
            >
              <ListItemAvatar>
                <Avatar>
                  <AddIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary={translate('app.action.create_new_group')} />
            </ListItemButton>
          </List>
        )}
      </SimpleBox>
    </>
  );
};

export default SelectGroupPage;
