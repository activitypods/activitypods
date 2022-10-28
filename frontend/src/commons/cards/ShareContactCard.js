import React from 'react';
import { makeStyles, Box, Card, Typography, TextField } from '@material-ui/core';
import { useGetIdentity, useTranslate } from 'react-admin';
import { formatUsername } from '../../utils';
import CopyButton from '../buttons/CopyButton';

const useStyles = makeStyles((theme) => ({
  root: {
    marginTop: 5,
    marginBottom: 24,
  },
  title: {
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 8em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    color: theme.palette.primary.contrastText,
    padding: '12px 16px',
    [theme.breakpoints.down('sm')]: {
      padding: '8px 16px',
    },
  },
  block: {
    backgroundColor: 'white',
  },
  textField: {
    paddingTop: 6,
  },
}));

const ShareContactCard = () => {
  const classes = useStyles();
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  const contactLink = identity && new URL(window.location.href).origin + '/u/' + formatUsername(identity?.id);
  return (
    <Card className={classes.root}>
      <Box className={classes.title} p={2}>
        <Typography variant="h6">{translate('app.card.share_contact')}</Typography>
      </Box>
      <Box className={classes.block} p={2}>
        <Typography variant="body2">{translate('app.helper.share_contact')}</Typography>
        <TextField
          variant="filled"
          margin="dense"
          value={contactLink}
          fullWidth
          InputLabelProps={{ shrink: false }}
          InputProps={{ endAdornment: <CopyButton text={contactLink} />, classes: { input: classes.textField } }}
        />
      </Box>
    </Card>
  );
};

export default ShareContactCard;
