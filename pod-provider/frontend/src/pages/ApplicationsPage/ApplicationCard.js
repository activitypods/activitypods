import React, { useState } from 'react';
import { useLocaleState, useTranslate } from 'react-admin';
import { Card, Typography, Button, Chip, IconButton } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import DoneIcon from '@mui/icons-material/Done';
import SettingsIcon from '@mui/icons-material/Settings';
import { getLangString } from '../../utils';
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
    color: 'grey',
    fontStyle: 'italic'
  },
  appChip: {
    backgroundColor: '#8bd78b',
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
  const classes = useStyles();
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const appDomain = new URL(app.id).host;

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
      {isTrustedApp && (
        <Chip
          size="small"
          label={translate('app.message.verified')}
          color="primary"
          onDelete={() => {}}
          deleteIcon={<DoneIcon />}
          className={classes.appChip}
        />
      )}
      <a href={app['oidc:client_uri']} target="_blank" rel="noopener noreferrer" className={classes.link}>
        <Button variant="contained">{translate('app.action.open_app')}</Button>
      </a>
      {isRegistered && (
        <IconButton onClick={() => setOpenSettings(true)}>
          <SettingsIcon />
        </IconButton>
      )}
      {openSettings && (
        <AppSettingsDialog application={app} open={openSettings} onClose={() => setOpenSettings(false)} />
      )}
    </Card>
  );
};

export default ApplicationCard;
