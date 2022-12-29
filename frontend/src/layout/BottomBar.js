import React from 'react';
import { BottomNavigation, BottomNavigationAction, Box, AppBar, makeStyles } from "@material-ui/core";
import { Link, useLocation } from 'react-router-dom';
import PeopleAltIcon from "@material-ui/icons/PeopleAlt";
import AssignmentIndIcon from "@material-ui/icons/AssignmentInd";
import AppsIcon from "@material-ui/icons/Apps";
import SettingsIcon from "@material-ui/icons/Settings";
import { useGetIdentity } from "react-admin";

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
  }
}));

const BottomBar = () => {
  const classes = useStyles();
  const { identity } = useGetIdentity();
  const location = useLocation();
  return (
    <>
      <Box className={classes.box} />
      <AppBar position="fixed" color="primary" className={classes.appBar} value={location.pathname}>
        <BottomNavigation showLabels className={classes.bottomNav}>
          <BottomNavigationAction label="Contacts" icon={<PeopleAltIcon />} component={Link} to="/Profile" />
          <BottomNavigationAction label="Profil" icon={<AssignmentIndIcon />}  component={Link} to={"/Profile/" + encodeURIComponent(identity?.profileData?.id)} />
          <BottomNavigationAction label="Applications" icon={<AppsIcon />} component={Link} to="/Location" />
          <BottomNavigationAction label="Paramètres" icon={<SettingsIcon />}  component={Link} to="/settings" />
        </BottomNavigation>
      </AppBar>
    </>
  );
}

export default BottomBar;