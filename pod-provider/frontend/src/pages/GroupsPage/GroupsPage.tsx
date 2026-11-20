import React from 'react';
import { useTranslate } from 'react-admin';
import { Link } from 'react-router-dom';
import {
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Button,
  Typography,
  useMediaQuery
} from '@mui/material';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import GroupIcon from '@mui/icons-material/PeopleAlt';
import Header from '../../common/Header';
import ListView from '../../layout/ListView';
import ProfileCard from '../../common/cards/ProfileCard';
import useGroups from '../../hooks/useGroups';

const GroupsPage = () => {
  const translate = useTranslate();
  const xs = useMediaQuery((theme: any) => theme.breakpoints.down('sm'), { noSsr: true });
  const { groups, isLoading } = useGroups();

  return (
    <>
      <Header title="app.titles.my_groups" />
      <ListView
        title={translate('app.page.my_groups')}
        actions={
          CONFIG.ENABLE_GROUPS
            ? [
                <Button component={Link} to="/groups/create" startIcon={<GroupAddIcon />}>
                  {translate('app.action.create_group')}
                </Button>
              ]
            : []
        }
        asides={xs ? [] : [<ProfileCard />]}
      >
        {!isLoading && groups.length === 0 && (
          <Typography sx={{ mt: 2 }}>{translate('app.helper.no_groups')}</Typography>
        )}
        <List>
          {groups.map(group => (
            <ListItemButton
              key={group.id}
              component={Link}
              to={`/network/${group.webfingerId}`}
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
        </List>
      </ListView>
    </>
  );
};

export default GroupsPage;
