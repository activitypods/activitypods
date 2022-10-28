import React, { forwardRef } from 'react';
import { UserMenu as RaUserMenu, MenuItemLink, useGetIdentity, linkToRecord, useTranslate } from 'react-admin';
import PersonIcon from '@material-ui/icons/Person';
import GroupIcon from '@material-ui/icons/Group';
import HomeIcon from '@material-ui/icons/Home';
import SettingsIcon from '@material-ui/icons/Settings';

const MyProfileMenu = forwardRef(({ onClick, label, profileUri }, ref) => (
  <MenuItemLink
    ref={ref}
    to={linkToRecord('/Profile', profileUri)}
    primaryText={label}
    leftIcon={<PersonIcon />}
    onClick={onClick}
  />
));

const MyAddressMenu = forwardRef(({ onClick, label }, ref) => (
  <MenuItemLink ref={ref} to="/Location" primaryText={label} leftIcon={<HomeIcon />} onClick={onClick} />
));

const AccountSettingsMenu = forwardRef(({ onClick, label, profileUri }, ref) => (
  <MenuItemLink ref={ref} to={'/account/settings'} primaryText={label} leftIcon={<SettingsIcon />} onClick={onClick} />
));

const MyNetworkMenu = forwardRef(({ onClick, label }, ref) => (
  <MenuItemLink ref={ref} to="/Profile" primaryText={label} leftIcon={<GroupIcon />} onClick={onClick} />
));

const LoginMenu = forwardRef(({ onClick, label }, ref) => (
  <MenuItemLink ref={ref} to="/login" primaryText={label} onClick={onClick} />
));

const UserMenu = ({ logout, ...otherProps }) => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  return (
    <RaUserMenu {...otherProps}>
      {identity && identity.id !== '' ? (
        [
          <MyProfileMenu
            key="my-profile"
            label={translate('app.page.profile')}
            profileUri={identity?.profileData?.id}
          />,
          <MyAddressMenu key="my-address" label={translate('app.page.addresses')} />,
          <AccountSettingsMenu
            key="settings"
            label={translate('app.page.settings')}
            profileUri={identity?.profileData?.id}
          />,
          <MyNetworkMenu key="my-network" label={translate('app.page.network')} />,
          React.cloneElement(logout, { key: 'logout' }),
        ]
      ) : (
        <LoginMenu label={translate('ra.auth.sign_in')} />
      )}
    </RaUserMenu>
  );
};

export default UserMenu;
