import React from 'react';
import { Box, Card, Typography, TextField } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { useTranslate } from 'react-admin';
import CopyButton from '../buttons/CopyButton';
import useContactLink from '../../hooks/useContactLink';

const useStyles = makeStyles(theme => ({
  root: {
    marginTop: 5,
    marginBottom: 24,
    [theme.breakpoints.down('sm')]: {
      marginTop: 16,
      marginBottom: 16
    }
  },
  title: {
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 8em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    color: theme.palette.black,
    padding: '10px 14px',
    [theme.breakpoints.down('sm')]: {
      padding: '8px 16px'
    }
  },
  block: {
    backgroundColor: 'white',
    [theme.breakpoints.down('sm')]: {
      padding: '12px !important'
    }
  },
  textField: {
    paddingTop: 6,
    [theme.breakpoints.down('sm')]: {
      fontSize: '0.9rem'
    }
  }
}));

const ShareContactCard = () => {
  const classes = useStyles();
  const translate = useTranslate();
  const contactLink = useContactLink();

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
