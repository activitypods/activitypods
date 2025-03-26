import React, { useEffect } from 'react';
import { Box, Card, Typography, Button, CircularProgress } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { useTranslate } from 'react-admin';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import useCreateContactLink from '../../hooks/useCreateContactLink';
import { useNotify } from 'react-admin';
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
  buttonContainer: {
    marginTop: 16,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8
  }
}));

const ShareContactCard = () => {
  const classes = useStyles();
  const translate = useTranslate();
  const { contactLink, status, error } = useContactLink();

  const onCreateContactLinkClicked = () => {
    createLink();
  };

  return (
    <Card className={classes.root}>
      <Box className={classes.title} p={2}>
        <Typography variant="h6">{translate('app.card.share_contact')}</Typography>
      </Box>
      <Box className={classes.block} p={2}>
        <Typography variant="body2">{translate('app.helper.share_contact')}</Typography>
        <Box className={classes.buttonContainer}>
          <span style={{ display: 'none' }}>{link}</span>
          <Button
            variant="contained"
            color="secondary"
            endIcon={status === 'loading' ? <CircularProgress size={24} /> : <ContentCopyIcon />}
            aria-label={translate('app.accessibility.copy_invitation_link_button')}
            onClick={onCreateContactLinkClicked}
            disabled={status === 'loading'}
          >
            {translate(
              status === 'success' && copied
                ? 'app.message.copied_to_clipboard'
                : status === 'loading'
                  ? 'app.message.creating_invite_link'
                  : 'app.action.create_invite_link'
            )}
          </Button>
        </Box>
      </Box>
    </Card>
  );
};

export default ShareContactCard;
