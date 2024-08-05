import React, { useState } from 'react';
import { Button, useTranslate, useGetOne } from 'react-admin';
import { Menu, MenuItem, ListItemIcon } from '@mui/material';
import AppsIcon from '@mui/icons-material/Apps';
import CheckIcon from '@mui/icons-material/Check';
import { arrayFromLdField } from '../../utils';

const AppMenuItem = ({ appUri, isDefault, ...rest }) => {
  const { data: app, isLoading } = useGetOne('App', { id: appUri });
  if (isLoading) return null;
  return (
    <MenuItem {...rest}>
      {isDefault && (
        <ListItemIcon>
          <CheckIcon />
        </ListItemIcon>
      )}
      {app.name}
    </MenuItem>
  );
};

const SetDefaultAppButton = ({ typeRegistration, color }) => {
  const translate = useTranslate();
  const [anchorEl, setAnchorEl] = useState(null);
  const handleOpen = event => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  return (
    <>
      <Button label={translate('app.action.set_default_app')} color={color} onClick={handleOpen}>
        <AppsIcon />
      </Button>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={handleClose}>
        {arrayFromLdField(typeRegistration['apods:availableApps']).map(appUri => (
          <AppMenuItem
            appUri={appUri}
            isDefault={appUri === typeRegistration['apods:defaultApp']}
            onClick={handleClose}
          />
        ))}
      </Menu>
    </>
  );
};

export default SetDefaultAppButton;
