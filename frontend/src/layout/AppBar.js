import React from 'react';
import {
  makeStyles,
  Typography,
  AppBar as MuiAppBar,
  IconButton,
  Toolbar,
  Badge,
  useMediaQuery,
} from '@material-ui/core';
import { LogoutButton } from '@semapps/auth-provider';
import { Link } from 'react-router-dom';
import AppIcon from '../config/AppIcon';
import UserMenu from './UserMenu';

const useStyles = makeStyles((theme) => ({
  root: {
    flexGrow: 1,
    backgroundImage: `radial-gradient(circle at 50% 14em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
  },
  menuButton: {
    color: 'white',
  },
  beta: {
    top: -2,
  },
  badge: {
    top: 12,
    right: -6,
  },
  title: {
    flexGrow: 1,
    marginLeft: 4,
    '& a': {
      color: 'white',
      textDecoration: 'none',
    },
  },
}));

const AppBar = ({ title }) => {
  const classes = useStyles();
  const xs = useMediaQuery((theme) => theme.breakpoints.down('xs'), { noSsr: true });
  return (
    <MuiAppBar position="sticky" className={classes.root}>
      <Toolbar>
        <Link to="/Event">
          <IconButton edge="start" className={classes.menuButton} color="inherit">
            <AppIcon fontSize="large" />
          </IconButton>
        </Link>
        <Typography variant="h4" className={classes.title}>
          <Link to="/Event">
            {xs ? (
              title
            ) : (
              <Badge badgeContent="Beta" color="primary" classes={{ root: classes.beta, badge: classes.badge }}>
                {title}
              </Badge>
            )}
          </Link>
        </Typography>
        <UserMenu logout={<LogoutButton />} />
      </Toolbar>
    </MuiAppBar>
  );
};

export default AppBar;
