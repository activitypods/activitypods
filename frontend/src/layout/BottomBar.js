import React, { useState, useEffect, useCallback } from 'react';
import { useGetIdentity, useTranslate } from "react-admin";
import { BottomNavigation, BottomNavigationAction, Box, AppBar, makeStyles } from "@material-ui/core";
import { Link, useLocation } from 'react-router-dom';
import PeopleAltIcon from "@material-ui/icons/PeopleAlt";
import AssignmentIndIcon from "@material-ui/icons/AssignmentInd";
import LocationOnIcon from '@material-ui/icons/LocationOn';
import SettingsIcon from "@material-ui/icons/Settings";

const useStyles = makeStyles(theme => ({
  box: {
    height: 56
  },
  appBar: {
    top: 'auto',
    bottom: 0,
  },
  bottomNav: {
    borderTopColor: theme.palette.primary.main,
    borderTopStyle: 'solid',
    borderTopWidth: 4,
    '& a': {
      boxSizing: 'border-box',
    }
  },
  selected: {
    color: theme.palette.secondary.main,
    '& svg': {
      fill: theme.palette.secondary.main,
    }
  }
}));

const BottomBar = () => {
  const classes = useStyles();
  const [value, setValue] = useState();
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/Profile/" + encodeURIComponent(identity?.profileData?.id)) {
      setValue('profile');
    } else if (location.pathname.startsWith('/Profile')) {
      setValue('contacts');
    } else if (location.pathname.startsWith('/Location')) {
      setValue('addresses');
    } else if (location.pathname.startsWith('/settings')) {
      setValue('settings');
    }
  }, [location.pathname, identity, setValue])

  const onChange = useCallback((e, newValue) => {
    setValue(newValue);
  }, [setValue]);

  return (
    <>
      <Box className={classes.box} />
      <AppBar position="fixed" color="primary" className={classes.appBar}>
        <BottomNavigation showLabels className={classes.bottomNav} value={value} onChange={onChange}>
          <BottomNavigationAction label={translate('app.page.contacts_short')} value="contacts" icon={<PeopleAltIcon />} component={Link} to="/Profile" classes={{ selected: classes.selected }} />
          <BottomNavigationAction label={translate('app.page.profile_short')} value="profile" icon={<AssignmentIndIcon />}  component={Link} to={"/Profile/" + encodeURIComponent(identity?.profileData?.id)} classes={{ selected: classes.selected }} />
          <BottomNavigationAction label={translate('app.page.addresses_short')} value="addresses" icon={<LocationOnIcon />} component={Link} to="/Location" classes={{ selected: classes.selected }} />
          <BottomNavigationAction label={translate('app.page.settings_short')} value="settings" icon={<SettingsIcon />}  component={Link} to="/settings" classes={{ selected: classes.selected }} />
        </BottomNavigation>
      </AppBar>
    </>
  );
}

export default BottomBar;