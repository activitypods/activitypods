import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNotify, useTranslate } from 'react-admin';
import { makeStyles, Typography, Box, Chip, Button } from '@material-ui/core';
import WarningIcon from '@material-ui/icons/Warning';
import DoneIcon from '@material-ui/icons/Done';
import SimpleBox from "../../layout/SimpleBox";

const useStyles = makeStyles(() => ({
  app: {
    padding: 15,
    paddingLeft: 70,
    position: 'relative',
    border: '1px solid lightgrey'
  },
  appIcon: {
    position: 'absolute',
    top: 15,
    left: 15,
    width: 40,
    height: 40
  },
  appTitle: {
    lineHeight: 1,
    marginBottom: 8,
  },
  appChip: {
    marginTop: 8,
    backgroundColor: '#8bd78b',
  },
  button: {
    marginLeft: 10
  }
}));

const AuthorizePageView = (props) => {
  const classes = useStyles(props);
  const [trustedApps, setTrustedApps] = useState(props.customTrustedApps || []);
  const notify = useNotify();
  const translate = useTranslate();

  const searchParams = new URLSearchParams(props.location.search);
  const redirectTo = searchParams.get('redirect');

  useEffect(() => {
    (async () => {
      if (trustedApps.length === 0) {
        const results = await fetch('https://data.activitypods.org/trusted-apps', {
          headers: {
            Accept: 'application/ld+json'
          }
        });
        if (results.ok) {
          const json = await results.json();
          setTrustedApps(json['ldp:contains']);
        } else {
          notify('app.notification.verified_applications_load_failed', 'error');
        }
      }
    })();
  }, [trustedApps, setTrustedApps, notify]);

  const appDomain = (new URL(redirectTo)).host;
  const trustedApp = trustedApps.find(a => a['apods:domainName'] === appDomain);

  const authorizedApps = useMemo(() => {
    if (localStorage.getItem('authorized_apps')) {
      return localStorage.getItem('authorized_apps').split(',')
    } else {
      return [];
    }
  }, [])

  const accessApp = useCallback(remember => {
    if (remember) {
      localStorage.setItem('authorized_apps', [...authorizedApps, appDomain].join(','))
    }
    const token = localStorage.getItem('token');
    const url = new URL(redirectTo);
    url.searchParams.set('token', token);
    window.location.href = url.toString();
  }, [authorizedApps, appDomain, redirectTo]);

  // Automatically redirect if app is already autorized
  useEffect(() => {
    if (authorizedApps.some(domain => domain === appDomain)) {
      accessApp(false);
    }
  }, [authorizedApps, appDomain, accessApp])

  return (
    <SimpleBox title={translate('app.page.authorize')} icon={<WarningIcon />} text={translate('app.helper.authorize', { appDomain })}>
      {trustedApp && (
        <Box p={2} pb={0}>
          <div className={classes.app}>
            <img src={trustedApp['apods:logo']} alt={trustedApp['apods:name']} className={classes.appIcon} />
            <Typography variant="h4" className={classes.appTitle}>{trustedApp['apods:name']}</Typography>
            <Typography variant="body2">{trustedApp['apods:description']}</Typography>
            <Chip
              size="small"
              label={translate('app.message.verified_app')}
              color="primary"
              onDelete={() => {}}
              deleteIcon={<DoneIcon />}
              className={classes.appChip}
            />
          </div>
        </Box>
      )}
      <Box p={2} display="flex" justifyContent="end">
        <Button variant="contained" color="secondary" className={classes.button} onClick={() => accessApp(true)}>{translate('app.action.accept')}</Button>
        <Link to="/">
          <Button variant="contained" className={classes.button}>{translate('app.action.reject')}</Button>
        </Link>
      </Box>
    </SimpleBox>
  );
};

export default AuthorizePageView;
