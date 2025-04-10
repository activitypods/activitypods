import React, { useEffect, useMemo, useState } from 'react';
import { useLocaleState, useTranslate, fetchUtils } from 'react-admin';
import { Card, Typography, Button, Chip, IconButton } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import DoneIcon from '@mui/icons-material/Done';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import LoopIcon from '@mui/icons-material/Loop';
import SettingsIcon from '@mui/icons-material/Settings';
import { arraysEqual, getLangString } from '../../utils';
import AppSettingsDialog from './AppSettingsDialog';

const useStyles = makeStyles(theme => ({
  card: {
    backgroundColor: 'white',
    padding: 16,
    boxShadow: '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)',
    position: 'relative',
    paddingLeft: 82
  },
  logo: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 50,
    height: 50
  },
  title: {
    lineHeight: '25px',
    [theme.breakpoints.down('sm')]: {
      lineHeight: '20px',
      fontSize: '1.3rem'
    }
  },
  description: {
    marginTop: 12
  },
  url: {
    marginTop: 6,
    marginBottom: 12,
    color: 'grey[400]',
    fontStyle: 'italic'
  },
  appChip: {
    // backgroundColor: '#8bd78b',
    marginTop: 6,
    [theme.breakpoints.up('sm')]: {
      marginTop: 0,
      position: 'absolute',
      top: 16,
      right: 16
    }
  },
  link: {
    textDecoration: 'none'
  }
}));

const ApplicationCard = ({ app, isTrustedApp, isRegistered }) => {
  const [openSettings, setOpenSettings] = useState(false);
  const [remoteApp, setRemoteApp] = useState();
  const [isOffline, setIsOffline] = useState(false);
  const classes = useStyles();
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const appDomain = new URL(app.id).host;

  useEffect(() => {
    (async () => {
      try {
        // Don't use the data provider because we don't want to use the proxy
        const { json, status } = await fetchUtils.fetchJson(app.id);
        if (status === 200) {
          setRemoteApp(json);
        } else {
          setIsOffline(true);
        }
      } catch (e) {
        setIsOffline(true);
      }
    })();
  }, [app, setRemoteApp, setIsOffline]);

  const isUpgradeRequired = useMemo(() => {
    if (remoteApp) {
      return !arraysEqual(app['interop:hasAccessNeedGroup'], remoteApp['interop:hasAccessNeedGroup']);
    }
  }, [app, remoteApp]);

  return (
    <Card className={classes.card}>
      <img src={app['interop:applicationThumbnail']} alt={app['interop:applicationName']} className={classes.logo} />
      <Typography variant="h4" className={classes.title}>
        {app['interop:applicationName']}
      </Typography>
      <Typography variant="body2" className={classes.description}>
        {getLangString(app['interop:applicationDescription'], locale)}
      </Typography>
      <Typography variant="body2" className={classes.url}>
        {appDomain}
      </Typography>
      {isOffline ? (
        <Chip
          size="small"
          label={translate('app.message.offline')}
          color="error"
          icon={<CloudOffIcon />}
          className={classes.appChip}
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : isUpgradeRequired ? (
        <Chip
          size="small"
          label={translate('app.message.upgrade_required')}
          color="warning"
          icon={<LoopIcon />}
          className={classes.appChip}
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : (
        isTrustedApp && (
          <Chip
            size="small"
            label={translate('app.message.verified')}
            color="success"
            icon={<DoneIcon />}
            className={classes.appChip}
            tabIndex={-1}
            aria-hidden="true"
          />
        )
      )}
      <a
        href={isOffline ? undefined : app['oidc:client_uri']}
        target="_blank"
        rel="noopener noreferrer"
        className={classes.link}
      >
        <Button variant="contained" color="secondary" disabled={isOffline}>
          {translate('app.action.open_app')}
        </Button>
      </a>
      {isRegistered && (
        <IconButton onClick={() => setOpenSettings(true)} aria-label={translate('app.action.app_settings')}>
          <SettingsIcon />
        </IconButton>
      )}
      {openSettings && (
        <AppSettingsDialog
          application={isOffline ? app : remoteApp} // If the app is offline, show permissions from the locally-stored app
          open={openSettings}
          onClose={() => setOpenSettings(false)}
        />
      )}
    </Card>
  );
};

export default ApplicationCard;
