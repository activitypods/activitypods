import React, { useState, useEffect, useCallback } from 'react';
import { useTranslate } from 'react-admin';
import { BottomNavigation, BottomNavigationAction, Box, AppBar } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { Link, useLocation } from 'react-router-dom';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import StorageIcon from '@mui/icons-material/Storage';
import AppsIcon from '@mui/icons-material/Apps';
import SettingsIcon from '@mui/icons-material/Settings';

const useStyles = makeStyles(theme => ({
  box: {
    height: 56
  },
  appBar: {
    top: 'auto',
    bottom: 0
  },
  bottomNav: {
    borderTopColor: theme.palette.primary.main,
    borderTopStyle: 'solid',
    borderTopWidth: 4,
    '& a': {
      boxSizing: 'border-box'
    }
  },
  selected: {
    color: 'black',
    '& svg': {
      fill: 'black'
    }
  }
}));

const BottomBar = () => {
  const classes = useStyles();
  const [value, setValue] = useState();
  const translate = useTranslate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith('/network') || location.pathname.startsWith('/Group')) {
      setValue('network');
    } else if (location.pathname.startsWith('/apps')) {
      setValue('apps');
    } else if (location.pathname.startsWith('/data')) {
      setValue('data');
    } else {
      setValue('settings');
    }
  }, [location.pathname, setValue]);

  const onChange = useCallback(
    (e, newValue) => {
      setValue(newValue);
    },
    [setValue]
  );

  return (
    <>
      <Box className={classes.box} />
      <AppBar position="fixed" color="primary" className={classes.appBar}>
        <BottomNavigation showLabels className={classes.bottomNav} value={value} onChange={onChange}>
          <BottomNavigationAction
            label={translate('app.page.contacts_short')}
            value="network"
            icon={<PeopleAltIcon />}
            component={Link}
            to="/network"
            classes={{ selected: classes.selected }}
          />
          <BottomNavigationAction
            label={translate('app.page.apps_short')}
            value="apps"
            icon={<AppsIcon />}
            component={Link}
            to="/apps"
            classes={{ selected: classes.selected }}
          />
          <BottomNavigationAction
            label={translate('app.page.data_short')}
            value="data"
            icon={<StorageIcon />}
            component={Link}
            to="/data"
            classes={{ selected: classes.selected }}
          />
          <BottomNavigationAction
            label={translate('app.page.settings_short')}
            value="settings"
            icon={<SettingsIcon />}
            component={Link}
            to="/settings"
            classes={{ selected: classes.selected }}
          />
        </BottomNavigation>
      </AppBar>
    </>
  );
};

export default BottomBar;
