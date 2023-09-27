import React, { useEffect, useState } from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { useTranslate, useGetList, useAuthProvider } from 'react-admin';
import {
  Box,
  makeStyles,
  Typography,
  List,
  ListItem,
  Avatar,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  IconButton
} from '@material-ui/core';
import { useHistory } from 'react-router-dom';
import EmailIcon from '@material-ui/icons/Email';
import PlaceIcon from '@material-ui/icons/Place';
import LockIcon from '@material-ui/icons/Lock';
import EditIcon from '@material-ui/icons/Edit';

const useStyles = makeStyles(() => ({
  listItem: {
    backgroundColor: 'white',
    marginBottom: 8,
    boxShadow: '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)'
  }
}));

const SettingsPage = () => {
  const translate = useTranslate();
  const authProvider = useAuthProvider();
  const history = useHistory();
  const [accountSettings, setAccountSettings] = useState({});
  useCheckAuthenticated();
  const classes = useStyles();

  const { ids } = useGetList('Location');

  useEffect(() => {
    authProvider.getAccountSettings().then(res => setAccountSettings(res));
  }, [setAccountSettings, authProvider]);

  const settings = [
    {
      path: '/Location',
      icon: <PlaceIcon />,
      label: 'app.setting.addresses',
      value: translate('app.setting.address', { smart_count: ids.length })
    },
    {
      path: '/settings/email',
      icon: <EmailIcon />,
      label: 'app.setting.email',
      value: accountSettings.email
    },
    {
      path: '/settings/password',
      icon: <LockIcon />,
      label: 'app.setting.password',
      value: '***************'
    }
  ];

  return (
    <>
      <Typography variant="h2" component="h1">
        {translate('app.page.settings')}
      </Typography>
      <Box mt={1}>
        <List>
          {settings.map(setting => (
            <ListItem button onClick={() => history.push(setting.path)} className={classes.listItem}>
              <ListItemAvatar>
                <Avatar>{setting.icon}</Avatar>
              </ListItemAvatar>
              <ListItemText primary={translate(setting.label)} secondary={setting.value} />
              <ListItemSecondaryAction>
                <IconButton>
                  <EditIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Box>
    </>
  );
};

export default SettingsPage;
