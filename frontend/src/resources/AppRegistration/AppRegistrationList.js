import React, { useCallback } from 'react';
import { useListContext, useTranslate, FunctionField, useNotify, useRefresh, RecordContextProvider } from 'react-admin';
import { Box, Card, Typography, Grid, Button, Chip, useMediaQuery, IconButton } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { ReferenceField } from '@semapps/field-components';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';
import List from '../../layout/List';
import DoneIcon from '@mui/icons-material/Done';
import DeleteIcon from '@mui/icons-material/Delete';
import useTrustedApps from '../../hooks/useTrustedApps';

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

const AppCardList = () => {
  const { data } = useListContext();
  const classes = useStyles();
  const translate = useTranslate();
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });
  const outbox = useOutbox();
  const trustedApps = useTrustedApps();
  const notify = useNotify();
  const refresh = useRefresh();

  const uninstallApp = useCallback(
    async appUri => {
      await outbox.post({
        type: ACTIVITY_TYPES.UNDO,
        actor: outbox.owner,
        object: {
          type: 'apods:Install',
          object: appUri
        }
      });

      // TODO await Accept response
      setTimeout(() => {
        notify('app.notification.app_uninstalled', { type: 'success' });
        // TODO logout
        refresh();
      }, 5000);
    },
    [outbox, notify, refresh]
  );

  return (
    <Box mt={1}>
      <Grid container spacing={xs ? 1 : 3}>
        {data &&
          data.map(record => {
            const appUrl = new URL(record['interop:registeredAgent']);
            const loginUrl = new URL('/auth', process.env.REACT_APP_POD_PROVIDER_URL);
            loginUrl.searchParams.set('redirect', appUrl.origin + '/auth-callback');
            loginUrl.searchParams.set('appDomain', appUrl.host);
            const isTrustedApp = trustedApps.some(domain => domain === record['apods:domainName']);
            return (
              <RecordContextProvider value={record} key={record.id}>
                <Grid item xs={12} sm={6}>
                  <Card className={classes.card}>
                    <ReferenceField reference="App" source="interop:registeredAgent" link={false}>
                      <FunctionField
                        render={app => (
                          <>
                            <img
                              src={app['interop:applicationThumbnail']}
                              alt={app['interop:applicationName']}
                              className={classes.logo}
                            />
                            <Typography variant="h4" className={classes.title}>
                              {app['interop:applicationName']}
                            </Typography>
                            <Typography variant="body2" className={classes.description}>
                              {app['interop:applicationDescription']}
                            </Typography>
                          </>
                        )}
                      />
                    </ReferenceField>
                    <Typography variant="body2" className={classes.url}>
                      {appUrl.host}
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
                    <a href={loginUrl.toString()} target="_blank" rel="noopener noreferrer" className={classes.link}>
                      <Button variant="contained">{translate('app.action.open_app')}</Button>
                    </a>
                    {!isTrustedApp && (
                      <IconButton onClick={() => uninstallApp(record['interop:registeredAgent'])}>
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </Card>
                </Grid>
              </RecordContextProvider>
            );
          })}
      </Grid>
    </Box>
  );
};

const AppList = () => {
  useCheckAuthenticated();
  const translate = useTranslate();
  return (
    <List title={translate('app.page.apps')} actions={[]} perPage={1000}>
      <AppCardList />
    </List>
  );
};

export default AppList;
