import React, { useState } from 'react';
import { Button, useGetIdentity, useLogout, useTranslate } from 'react-admin';
import { Menu, MenuItem, Avatar, ListItemIcon, useMediaQuery } from '@mui/material';
import ExitIcon from '@mui/icons-material/PowerSettingsNew';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import GroupIcon from '@mui/icons-material/PeopleAlt';
import PersonIcon from '@mui/icons-material/Person';
import { Link } from 'react-router-dom';
import useOwnedGroups from '../hooks/useOwnedGroups';
import useRealmContext from '../hooks/useRealmContext';

const UserMenu = () => {
  const translate = useTranslate();
  const { data: identity } = useGetIdentity();
  const logout = useLogout();
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });
  const { isLoading, isGroup, data } = useRealmContext();
  const groups = useOwnedGroups();

  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const handleClose = () => setAnchorEl(null);

  if (isLoading) return null;

  return (
    <>
      <Button
        // @ts-expect-error TS(2345): Argument of type 'EventTarget & HTMLButtonElement'... Remove this comment to see the full error message
        onClick={e => setAnchorEl(e.currentTarget)}
        label={data?.fullName}
        // @ts-expect-error TS(2322): Type '"black"' is not assignable to type '"inherit... Remove this comment to see the full error message
        color="black"
        sx={{ textTransform: 'none', fontSize: '14px', padding: '6px 8px' }}
      >
        {data?.avatar ? (
          <Avatar alt={data?.fullName} src={data?.avatar} sx={{ width: 24, height: 24 }} />
        ) : isGroup ? (
          <GroupIcon />
        ) : (
          <PersonIcon />
        )}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right'
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right'
        }}
        MenuListProps={{ dense: xs }}
      >
        <Link to="/network" style={{ textDecoration: 'none' }}>
          <MenuItem onClick={handleClose}>
            <ListItemIcon>
              <Avatar alt={identity?.fullName} src={identity?.avatar} sx={{ width: 24, height: 24 }} />
            </ListItemIcon>
            {identity?.fullName}
          </MenuItem>
        </Link>
        {groups.map(group => (
          <Link
            // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
            key={group.id}
            // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
            to={`/group/@${group['foaf:nick']}@${new URL(group.id).host}/settings`}
            style={{ textDecoration: 'none' }}
          >
            <MenuItem onClick={handleClose}>
              <ListItemIcon>
                {group['foaf:depiction'] ? (
                  <Avatar src={group['foaf:depiction']} sx={{ width: 24, height: 24 }} />
                ) : (
                  <GroupIcon />
                )}
              </ListItemIcon>
              {group['foaf:name']}
            </MenuItem>
          </Link>
        ))}
        {CONFIG.ENABLE_GROUPS && (
          <Link to="/groups/create" style={{ textDecoration: 'none' }}>
            <MenuItem onClick={handleClose}>
              <ListItemIcon>
                <GroupAddIcon />
              </ListItemIcon>
              {translate('app.action.create_group')}
            </MenuItem>
          </Link>
        )}
        <MenuItem onClick={() => logout()}>
          <ListItemIcon>
            <ExitIcon />
          </ListItemIcon>
          {translate('ra.auth.logout')}
        </MenuItem>
      </Menu>
    </>
  );
};

export default UserMenu;
