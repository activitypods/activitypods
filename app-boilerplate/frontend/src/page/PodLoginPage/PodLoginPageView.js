import React, { useEffect, useState } from 'react';
import jwtDecode from 'jwt-decode';
import { useNotify, useAuthProvider, useDataProvider, useLocaleState, useTranslate } from 'react-admin';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, List, ListItem, ListItemText, ListItemAvatar, Avatar, Divider, Card, Typography } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import LockIcon from '@mui/icons-material/Lock';
import StorageIcon from '@mui/icons-material/Storage';

const useStyles = makeStyles(theme => ({
  // '@global': {
  //   body: {
  //     backgroundColor: theme.palette.primary.main
  //   }
  // },
  text: {
    textAlign: 'center',
    padding: '4px 8px 8px'
  },
  card: {
    minWidth: 300,
    maxWidth: 350,
    marginTop: '6em',
    [theme.breakpoints.down('sm')]: {
      margin: '1em'
    }
  },
  lockIconAvatar: {
    margin: '1em',
    display: 'flex',
    justifyContent: 'center'
  },
  lockIcon: {
    backgroundColor: theme.palette.grey['500']
  },
  list: {
    paddingTop: 0,
    paddingBottom: 0
  },
  listItem: {
    paddingTop: 5,
    paddingBottom: 5
  }
}));

const PodLoginPageView = ({ text, customPodProviders }) => {
  const classes = useStyles();
  const notify = useNotify();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [locale] = useLocaleState();
  const translate = useTranslate();
  const authProvider = useAuthProvider();
  const dataProvider = useDataProvider();
  const [podProviders, setPodProviders] = useState(customPodProviders || []);

  useEffect(() => {
    (async () => {
      if (podProviders.length === 0) {
        const results = await fetch('https://data.activitypods.org/pod-providers', {
          headers: {
            Accept: 'application/ld+json'
          }
        });
        if (results.ok) {
          const json = await results.json();
          // Filter POD providers by available locales
          const podProviders = json['ldp:contains'].filter(provider =>
            Array.isArray(provider['apods:locales'])
              ? provider['apods:locales'].includes(locale)
              : provider['apods:locales'] === locale
          );
          setPodProviders(podProviders);
        } else {
          notify('auth.message.pod_providers_not_loaded', 'error');
        }
      }
    })();
  }, [podProviders, setPodProviders, notify, locale]);

  useEffect(() => {
    (async () => {
      if (searchParams.has('token')) {
        const token = searchParams.get('token');
        const { webId } = jwtDecode(token);
        const response = await fetch(webId, {
          headers: {
            Accept: 'application/json'
          }
        });
        if (!response.ok) {
          notify('auth.message.unable_to_fetch_user_data', 'error');
        } else {
          const data = await response.json();
          if (!authProvider.checkUser(data)) {
            notify('auth.message.user_not_allowed_to_login', 'error');
            navigate('/login');
          } else {
            localStorage.setItem('token', token);
            notify('auth.message.user_connected', 'info');
            // Reload to ensure the dataServers config is reset
            window.location.reload();
            window.location.href = '/?addUser=true';
          }
        }
      } else if (searchParams.has('logout')) {
        // Delete token and any other value in local storage
        localStorage.clear();
        notify('auth.message.user_disconnected', 'info');
        navigate.push('/');
      }
    })();
  }, [searchParams, dataProvider, navigate, authProvider, notify]);

  if (searchParams.has('token') || searchParams.has('addUser') || searchParams.has('logout')) {
    return null;
  }

  return (
    <Box display="flex" flexDirection="column" alignItems="center">
      <Card className={classes.card}>
        <div className={classes.lockIconAvatar}>
          <Avatar className={classes.lockIcon}>
            <LockIcon />
          </Avatar>
        </div>
        <Box pl={2} pr={2}>
          <Typography variant="body2" className={classes.text}>
            {text || translate('auth.message.choose_pod_provider')}
          </Typography>
        </Box>
        <Box m={2}>
          <List className={classes.list}>
            {podProviders.map((podProvider, i) => {
              const url = new URL(
                '/auth',
                (podProvider['apods:domainName'].includes(':') ? 'http://' : 'https://') +
                  podProvider['apods:domainName']
              );
              if (searchParams.has('signup')) url.searchParams.set('signup', 'true');
              url.searchParams.set('redirect', window.location.href);
              url.searchParams.set('appDomain', process.env.REACT_APP_BACKEND_DOMAIN_NAME);
              return (
                <React.Fragment key={i}>
                  <Divider />
                  <ListItem
                    key={i}
                    button
                    onClick={() => (window.location.href = url.toString())}
                    className={classes.listItem}
                  >
                    <ListItemAvatar>
                      <Avatar>
                        <StorageIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={podProvider['apods:domainName']} secondary={podProvider['apods:area']} />
                  </ListItem>
                </React.Fragment>
              );
            })}
          </List>
        </Box>
      </Card>
    </Box>
  );
};

export default PodLoginPageView;
