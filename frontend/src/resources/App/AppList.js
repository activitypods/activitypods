import React, { useCallback } from 'react';
import { useListContext, useTranslate, FunctionField, useDataProvider, useNotify, useRefresh } from 'react-admin';
import { makeStyles, Card, Typography, Grid, Button, Chip, useMediaQuery, IconButton } from '@material-ui/core';
import { ReferenceField } from '@semapps/field-components';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import List from '../../layout/List';
import DoneIcon from '@material-ui/icons/Done';
import DeleteIcon from '@material-ui/icons/Delete';
import useTrustedApps from '../../hooks/useTrustedApps';

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: 'white',
    padding: 16,
    boxShadow: '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)',
    position: 'relative',
    paddingLeft: 82,
  },
  logo: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 50,
    height: 50,
  },
  title: {
    lineHeight: '25px',
    [theme.breakpoints.down('xs')]: {
      lineHeight: '20px',
      fontSize: '1.3rem',
    },
  },
  description: {
    marginTop: 12,
  },
  url: {
    marginTop: 6,
    marginBottom: 12,
    color: 'grey',
    fontStyle: 'italic',
  },
  appChip: {
    backgroundColor: '#8bd78b',
    marginTop: 6,
    [theme.breakpoints.up('sm')]: {
      marginTop: 0,
      position: 'absolute',
      top: 16,
      right: 16,
    },
  },
  link: {
    textDecoration: 'none',
  },
}));

const AppCardList = () => {
  const { ids, data } = useListContext();
  const classes = useStyles();
  const translate = useTranslate();
  const xs = useMediaQuery((theme) => theme.breakpoints.down('xs'), { noSsr: true });
  const dataProvider = useDataProvider();
  const trustedApps = useTrustedApps();
  const notify = useNotify();
  const refresh = useRefresh();

  const deleteApp = useCallback(
    async (appUri) => {
      await dataProvider.delete('App', { id: appUri });
      notify('app.notification.app_uninstalled', { type: 'success' });
      refresh();
    },
    [dataProvider, notify, refresh]
  );

  return (
    <Grid container spacing={xs ? 1 : 3}>
      {ids
        .filter((id) => data[id]['apods:application'])
        .map((id) => {
          const appUrl = `${data[id]['apods:domainName'].includes(':') ? 'http' : 'https'}://${
            data[id]['apods:domainName']
          }`;
          const isTrustedApp = trustedApps.some((domain) => domain === data[id]['apods:domainName']);
          return (
            <Grid item xs={12} sm={6} key={id}>
              <Card className={classes.card}>
                <ReferenceField record={data[id]} reference="AppDescription" source="apods:application" link={false}>
                  <FunctionField
                    render={(app) => (
                      <>
                        <img src={app.image} alt={app.name} className={classes.logo} />
                        <Typography variant="h4" className={classes.title}>
                          {app.name}
                        </Typography>
                        <Typography variant="body2" className={classes.description}>
                          {app.content}
                        </Typography>
                      </>
                    )}
                  />
                </ReferenceField>
                <Typography variant="body2" className={classes.url}>
                  {appUrl}
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
                <a href={appUrl} target="_blank" rel="noopener noreferrer" className={classes.link}>
                  <Button variant="contained">{translate('app.action.open_app')}</Button>
                </a>
                {!isTrustedApp && (
                  <IconButton onClick={() => deleteApp(id)}>
                    <DeleteIcon />
                  </IconButton>
                )}
              </Card>
            </Grid>
          );
        })}
    </Grid>
  );
};

const AppList = (props) => {
  useCheckAuthenticated();
  const translate = useTranslate();
  return (
    <List title={translate('app.page.apps')} actions={[]} perPage={1000} {...props}>
      <AppCardList />
    </List>
  );
};

export default AppList;
