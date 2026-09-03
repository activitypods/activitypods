import React from 'react';
import { useTranslate, Link } from 'react-admin';
import { Box, Container, Breadcrumbs } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import useRealmContext from '../hooks/useRealmContext';

const useStyles = makeStyles()(theme => ({
  menuBar: {
    backgroundColor: 'white',
    borderBottomColor: theme.palette.primary.main,
    borderBottomStyle: 'solid',
    borderBottomWidth: 4,
    position: 'relative',
    zIndex: 50
  },
  link: {
    fontSize: '14pt',
    color: 'black',
    fontWeight: '300',
    lineHeight: '2.2em',
    textDecoration: 'none'
  }
}));

const MenuBar = () => {
  const { classes } = useStyles();
  const translate = useTranslate();
  const { isGroup, data } = useRealmContext();
  return (
    <Box className={classes.menuBar}>
      <Container>
        <Breadcrumbs separator="|">
          {!isGroup && (
            <Link
              to="/network"
              className={classes.link}
              aria-label={translate('app.page.contacts')}
              aria-description={translate('app.accessibility.network_link_description')}
            >
              {translate('app.page.contacts')}
            </Link>
          )}
          {!isGroup && (
            <Link
              to="/apps"
              className={classes.link}
              aria-label={translate('app.page.apps')}
              aria-description={translate('app.accessibility.apps_link_description')}
            >
              {translate('app.page.apps')}
            </Link>
          )}
          {!isGroup && (
            <Link
              to="/data"
              className={classes.link}
              aria-label={translate('app.page.data')}
              aria-description={translate('app.accessibility.data_link_description')}
            >
              {translate('app.page.data')}
            </Link>
          )}
          <Link
            to={isGroup ? `/group/${data?.webfingerId}/settings` : '/settings'}
            className={classes.link}
            aria-label={translate('app.page.settings')}
            aria-description={translate('app.accessibility.settings_link_description')}
          >
            {translate('app.page.settings')}
          </Link>
        </Breadcrumbs>
      </Container>
    </Box>
  );
};

export default MenuBar;
