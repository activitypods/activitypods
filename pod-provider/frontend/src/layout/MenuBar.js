import React from 'react';
import { useTranslate, Link } from 'react-admin';
import { Box, Container, Breadcrumbs } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import useRealmContext from '../hooks/useRealmContext';

const useStyles = makeStyles(theme => ({
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
    lineHeight: '2.2em'
  }
}));

const MenuBar = () => {
  const classes = useStyles();
  const translate = useTranslate();
  const { isGroup, data } = useRealmContext();
  return (
    <Box className={classes.menuBar}>
      <Container>
        <Breadcrumbs separator="|">
          {!isGroup && (
            <Link to="/network" className={classes.link}>
              {translate('app.page.contacts')}
            </Link>
          )}
          {!isGroup && (
            <Link to="/apps" className={classes.link}>
              {translate('app.page.apps')}
            </Link>
          )}
          {!isGroup && (
            <Link to="/data" className={classes.link}>
              {translate('app.page.data')}
            </Link>
          )}
          <Link to={isGroup ? `/group/${data?.webfingerId}/settings` : '/settings'} className={classes.link}>
            {translate('app.page.settings')}
          </Link>
        </Breadcrumbs>
      </Container>
    </Box>
  );
};

export default MenuBar;
