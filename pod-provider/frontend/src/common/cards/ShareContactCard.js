import React, { useState, useEffect } from 'react';
import { Box, Card, Typography, Button, CircularProgress } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { useTranslate } from 'react-admin';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import useCreateContactLink from '../../hooks/useCreateContactLink';
import { useNotify } from 'react-admin';

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
  const notify = useNotify();
  const { createLink, link, status, errorDetails } = useCreateContactLink();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status === 'error') {
      notify('app.notification.contact_link_creation_failed', { type: 'error', messageArgs: { error: errorDetails } });
    }
  }, [status, errorDetails, notify]);

  return (
    <Card className={classes.root}>
      <Box className={classes.title} p={2}>
        <Typography variant="h6">{translate('app.card.share_contact')}</Typography>
      </Box>
      <Box className={classes.block} p={2}>
        <Typography variant="body2">{translate('app.helper.share_contact')}</Typography>
        <Box className={classes.buttonContainer}>
          <span style={{ display: 'none' }}>{link}</span>
          <CopyToClipboard text={link} onCopy={() => setCopied(true)}>
            <Button
              variant="contained"
              color="secondary"
              endIcon={status === 'loading' ? <CircularProgress size={24} /> : <ContentCopyIcon />}
              aria-label={translate('app.accessibility.copy_invitation_link_button')}
              onClick={() => createLink()}
              disabled={status === 'loading'}
            >
              {translate(
                status === 'success' && copied
                  ? 'app.message.copied_to_clipboard'
                  : status === 'loading'
                    ? 'app.message.loading'
                    : 'app.action.copy'
              )}
            </Button>
          </CopyToClipboard>
        </Box>
      </Box>
    </Card>
  );
};

export default ShareContactCard;
