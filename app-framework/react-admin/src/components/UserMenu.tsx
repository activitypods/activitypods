import React, { FunctionComponent } from 'react';
import urlJoin from 'url-join';
import { UserMenu as RaUserMenu, Logout, MenuItemLink, useGetIdentity, useTranslate } from 'react-admin';
import { MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import StorageIcon from '@mui/icons-material/Storage';
import AppsIcon from '@mui/icons-material/Apps';
import SettingsIcon from '@mui/icons-material/Settings';
import { useNodeinfo } from '@semapps/activitypub-components';

const UserMenu: FunctionComponent = () => {
  const { data: identity } = useGetIdentity();
  const nodeinfo = useNodeinfo(
    identity?.webIdData?.['solid:oidcIssuer'] && new URL(identity?.webIdData?.['solid:oidcIssuer']).host
  );
  const translate = useTranslate();

  if (identity?.id && !nodeinfo) return null;

  return (
    <RaUserMenu>
      {identity?.id ? (
        [
          <MenuItem key="network" component="a" href={urlJoin(nodeinfo?.metadata?.frontend_url as string, 'network')}>
            <ListItemIcon>
              <PeopleAltIcon />
            </ListItemIcon>
            <ListItemText>{translate('apods.user_menu.network')}</ListItemText>
          </MenuItem>,
          <MenuItem key="apps" component="a" href={urlJoin(nodeinfo?.metadata?.frontend_url as string, 'apps')}>
            <ListItemIcon>
              <AppsIcon />
            </ListItemIcon>
            <ListItemText>{translate('apods.user_menu.apps')}</ListItemText>
          </MenuItem>,
          <MenuItem key="data" component="a" href={urlJoin(nodeinfo?.metadata?.frontend_url as string, 'data')}>
            <ListItemIcon>
              <StorageIcon />
            </ListItemIcon>
            <ListItemText>{translate('apods.user_menu.data')}</ListItemText>
          </MenuItem>,
          <MenuItem key="settings" component="a" href={urlJoin(nodeinfo?.metadata?.frontend_url as string, 'settings')}>
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText>{translate('apods.user_menu.settings')}</ListItemText>
          </MenuItem>,
          <Logout key="logout" />
        ]
      ) : (
        <MenuItemLink to="/login" primaryText={translate('ra.auth.sign_in')} />
      )}
    </RaUserMenu>
  );
};

export default UserMenu;
