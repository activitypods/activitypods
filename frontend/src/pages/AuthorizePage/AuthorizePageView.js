import React, { useCallback, useEffect, useState } from 'react';
import { Link, useDataProvider, useTranslate, useGetList } from 'react-admin';
import { makeStyles, Typography, Box, Chip, Button } from '@material-ui/core';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import WarningIcon from '@material-ui/icons/Warning';
import DoneIcon from '@material-ui/icons/Done';
import SimpleBox from '../../layout/SimpleBox';
import useTrustedApps from '../../hooks/useTrustedApps';

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
    marginBottom: 8
  },
  appChip: {
    marginTop: 8,
    backgroundColor: '#8bd78b'
  },
  appUrl: {
    marginTop: 5,
    color: 'grey',
    fontStyle: 'italic'
  },
  button: {
    marginLeft: 10
  }
}));

const AuthorizePageView = props => {
  const classes = useStyles(props);
  useCheckAuthenticated();
  const [appData, setAppData] = useState({});
  const [showScreen, setShowScreen] = useState(false);
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const trustedApps = useTrustedApps();
  const { data: registeredApps, loaded } = useGetList('App', { page: 1, perPage: 1000 });

  const searchParams = new URLSearchParams(props.location.search);
  const redirectTo = new URL(searchParams.get('redirect'));
  const appDomain = redirectTo.host;
  const appOrigin = redirectTo.origin;
  const isTrustedApp = trustedApps.some(domain => domain === appDomain);

  useEffect(() => {
    (async () => {
      if (appOrigin) {
        try {
          const { data } = await dataProvider.getOne('AppDescription', { id: `${appOrigin}/application.json` });
          setAppData(data);
        } catch (e) {
          // Do nothing if application.json file is not found
        }
      }
    })();
  }, [dataProvider, appOrigin, setAppData]);

  const accessApp = useCallback(
    async register => {
      if (register) {
        await dataProvider.create('App', {
          data: {
            type: 'apods:FrontAppRegistration',
            'apods:application': `${redirectTo.origin}/application.json`,
            'apods:domainName': redirectTo.host,
            'apods:preferredForTypes': appData['apods:handledTypes']
          }
        });
      }
      const token = localStorage.getItem('token');
      redirectTo.searchParams.set('token', token);
      window.location.href = redirectTo.toString();
    },
    [dataProvider, redirectTo, appData]
  );

  // Once all data are loaded, either redirect to app or show authorization screen
  useEffect(() => {
    if (loaded) {
      if (Object.values(registeredApps).some(app => app['apods:domainName'] === appDomain)) {
        accessApp(false);
      } else {
        setShowScreen(true);
      }
    }
  }, [registeredApps, loaded, appDomain, accessApp, setShowScreen]);

  if (!showScreen) return null;

  return (
    <SimpleBox
      title={translate('app.page.authorize')}
      icon={<WarningIcon />}
      text={translate('app.helper.authorize', { appDomain })}
    >
      {appData && (
        <Box p={2} pb={0}>
          <div className={classes.app}>
            <img src={appData.image} alt={appData.name} className={classes.appIcon} />
            <Typography variant="h4" className={classes.appTitle}>
              {appData.name}
            </Typography>
            <Typography variant="body2">{appData.content}</Typography>
            <Typography variant="body2" className={classes.appUrl}>
              {appOrigin}
            </Typography>
            {isTrustedApp && (
              <Chip
                size="small"
                label={translate('app.message.verified_app')}
                color="primary"
                onDelete={() => {}}
                deleteIcon={<DoneIcon />}
                className={classes.appChip}
              />
            )}
          </div>
        </Box>
      )}
      <Box p={2} display="flex" justifyContent="end">
        <Button variant="contained" color="secondary" className={classes.button} onClick={() => accessApp(true)}>
          {translate('app.action.accept')}
        </Button>
        <Link to="/">
          <Button variant="contained" className={classes.button}>
            {translate('app.action.reject')}
          </Button>
        </Link>
      </Box>
    </SimpleBox>
  );
};

export default AuthorizePageView;
