import React from 'react';
import { useLocaleState } from 'react-admin';
import { Typography, Box, Chip } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { getLangString } from '../../utils';

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

const AppHeader = ({ application, isTrustedApp }) => {
  const classes = useStyles();
  const [locale] = useLocaleState();

  return (
    <Box pt={1} pb={0}>
      <div className={classes.app}>
        <img
          src={application['interop:applicationThumbnail']}
          alt={application['interop:applicationName']}
          className={classes.appIcon}
        />
        <Typography variant="h4" className={classes.appTitle}>
          {application['interop:applicationName']}
        </Typography>
        <Typography variant="body2">{getLangString(application['interop:applicationDescription'], locale)}</Typography>
        <Typography variant="body2" className={classes.appUrl}>
          {new URL(application.id).host}
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
  );
};

export default AppHeader;
