import React, { useState } from 'react';
import { Box, Card, Typography, Button, CircularProgress } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { useTranslate } from 'react-admin';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { CopyToClipboard } from 'react-copy-to-clipboard';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import useContactLink from '../../hooks/useContactLink';

const useStyles = makeStyles(theme => ({
  root: {
    marginTop: 5,
    marginBottom: 24,
    // @ts-expect-error TS(2339): Property 'breakpoints' does not exist on type 'Def... Remove this comment to see the full error message
    [theme.breakpoints.down('sm')]: {
      marginTop: 16,
      marginBottom: 16
    }
  },
  title: {
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    // @ts-expect-error TS(2339): Property 'palette' does not exist on type 'Default... Remove this comment to see the full error message
    backgroundImage: `radial-gradient(circle at 50% 8em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    // @ts-expect-error TS(2339): Property 'palette' does not exist on type 'Default... Remove this comment to see the full error message
    color: theme.palette.black,
    padding: '10px 14px',
    // @ts-expect-error TS(2339): Property 'breakpoints' does not exist on type 'Def... Remove this comment to see the full error message
    [theme.breakpoints.down('sm')]: {
      padding: '8px 16px'
    }
  },
  block: {
    backgroundColor: 'white',
    // @ts-expect-error TS(2339): Property 'breakpoints' does not exist on type 'Def... Remove this comment to see the full error message
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
  const [copied, setCopied] = useState(false);

  return (
    <Card className={classes.root}>
      <Box className={classes.title} p={2}>
        <Typography variant="h6">{translate('app.card.share_contact')}</Typography>
      </Box>
      <Box className={classes.block} p={2}>
        <Typography variant="body2">{translate('app.helper.share_contact')}</Typography>
        <Box className={classes.buttonContainer}>
          <span style={{ display: 'none' }}>{contactLink}</span>
          <CopyToClipboard text={contactLink} onCopy={() => setCopied(true)}>
            <Button
              variant="contained"
              color="secondary"
              endIcon={status === 'loading' ? <CircularProgress size={24} /> : <ContentCopyIcon />}
              aria-label={translate('app.accessibility.copy_invitation_link_button')}
              disabled={status !== 'loaded'}
            >
              {translate(
                // @ts-expect-error TS(2345): Argument of type 'string | boolean' is not assigna... Remove this comment to see the full error message
                (copied && 'app.message.copied_to_clipboard') ||
                  (status === 'loaded' && 'app.action.copy') ||
                  (status === 'loading' && 'app.message.loading_invite_link') ||
                  (status === 'error' && 'app.message.loading_invite_link_failed')
              )}
            </Button>
          </CopyToClipboard>
        </Box>
      </Box>
    </Card>
  );
};

export default ShareContactCard;
