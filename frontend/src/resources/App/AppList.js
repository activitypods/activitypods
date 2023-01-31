import React from 'react';
import { useListContext, useTranslate } from 'react-admin';
import { makeStyles, Card, Typography, Grid, Button, Chip, useMediaQuery } from "@material-ui/core";
import { useCheckAuthenticated } from '@semapps/auth-provider';
import List from "../../layout/List";
import DoneIcon from "@material-ui/icons/Done";

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
    [theme.breakpoints.down('xs')]: {
      lineHeight: '20px',
      fontSize: '1.3rem'
    },
  },
  description: {
    marginTop: 12,
    marginBottom: 12,
  },
  appChip: {
    backgroundColor: '#8bd78b',
    marginTop: 6,
    [theme.breakpoints.up('sm')]: {
      marginTop: 0,
      position: 'absolute',
      top: 16,
      right: 16
    },
  },
  link: {
    textDecoration: 'none'
  }
}));

const AppCardList = () => {
  const { ids, data } = useListContext();
  const classes = useStyles();
  const translate = useTranslate();
  const xs = useMediaQuery((theme) => theme.breakpoints.down('xs'), { noSsr: true });
  return (
    <Grid container spacing={xs ? 1 : 3}>
      {ids
        .filter(id => data[id]['apods:locales'] === process.env.REACT_APP_LANG)
        .map(id =>
          <Grid item xs={12} sm={6} key={id}>
            <Card className={classes.card}>
              <img src={data[id]['apods:logo']} alt={data[id]['apods:name']} className={classes.logo} />
              <Typography variant="h4" className={classes.title}>{data[id]['apods:name']}</Typography>
              <Chip
                size="small"
                label={translate('app.message.verified')}
                color="primary"
                onDelete={() => {}}
                deleteIcon={<DoneIcon />}
                className={classes.appChip}
              />
              <Typography variant="body2" className={classes.description}>{data[id]['apods:description']}</Typography>
              <a href={`https://${data[id]['apods:domainName']}`} target="_blank" rel="noopener noreferrer" className={classes.link}>
                <Button variant="contained">{translate('app.action.open_app')}</Button>
              </a>
            </Card>
          </Grid>
      )}
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
}

export default AppList;
