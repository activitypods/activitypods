import React, { useEffect } from 'react';
import { Box, Card, Typography, TextField } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { useGetIdentity, useTranslate, useGetList } from 'react-admin';
import CopyButton from '../buttons/CopyButton';

const useStyles = makeStyles(theme => ({
  root: {
    marginTop: 5,
    marginBottom: 24
  },
  title: {
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 8em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    color: theme.palette.primary.contrastText,
    padding: '10px 14px',
    [theme.breakpoints.down('sm')]: {
      padding: '8px 16px'
    }
  },
  block: {
    backgroundColor: 'white'
  },
  textField: {
    paddingTop: 6
  }
}));

const ShareContactCard = () => {
  const classes = useStyles();
  const { data: identity } = useGetIdentity();
  const profileData = identity?.profileData;
  const translate = useTranslate();
  const [contactLink, setContactLink] = React.useState('');
  const { data: caps } = useGetList('Capability');

  // Get invite capability URI.
  useEffect(() => {
    if (!contactLink && profileData?.describes) {
      setContactLink(translate('ra.page.loading'));
    } else if (contactLink && profileData?.describes && caps) {
      const inviteCapability = caps.find(
        cap =>
          cap.type === 'acl:Authorization' && cap['acl:Mode'] === 'acl:Read' && cap['acl:AccessTo'] === profileData.id
      );
      if (inviteCapability) {
        setContactLink(`${new URL(window.location.href).origin}/invite/${encodeURIComponent(inviteCapability.id)}`);
      } else {
        setContactLink(translate('app.notification.invite_cap_missing'));
      }
    }
  }, [profileData, contactLink, caps]);

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
