/* eslint-disable react/prop-types */
import { Typography, Button, Grid } from '@mui/material';
import React from 'react';
import { useLocaleState, useTranslate } from 'react-admin';
import { formatUsername } from '../../utils';
import ConnectAvatars from './ConnectAvatars';
import SimpleBox from '../../layout/SimpleBox';

const InvitePageViewLoggedIn = ({
  inviterProfile,
  ownProfile,
  onConnectClick,
  onCancelClick
}: {
  inviterProfile: any;
  ownProfile: any;
  onConnectClick: () => void;
  onCancelClick: () => void;
}) => {
  const { 'vcard:given-name': inviterFirstName, describes: inviterWebId } = inviterProfile;
  const memberSince = new Date(inviterProfile['dc:created']);

  const [locale] = useLocaleState();
  const translate = useTranslate();

  return (
    <SimpleBox
      title={translate('app.page.invite_connect', { username: inviterFirstName || '' })}
      infoText={
        <Typography variant="body2">
          {translate('app.helper.invite_text_logged_in', { username: inviterFirstName })}
        </Typography>
      }
    >
      {/* Connect Avatars & Info */}
      <Grid container item flexDirection="column" alignSelf="center" alignItems="center" width="fit-content">
        <ConnectAvatars frontProfile={inviterProfile} backProfile={ownProfile} avatarSize="min(45vw, 12rem)" />
        <Grid item>
          <Typography align="center">{formatUsername(inviterWebId)}</Typography>
        </Grid>
        <Grid item display="flex" justifyContent="center">
          <Typography variant="body2" component="label">
            {translate('app.user.member_since')}
            &nbsp;
            {memberSince.toLocaleDateString(locale, {
              dateStyle: 'medium'
            })}
          </Typography>{' '}
        </Grid>
      </Grid>

      {/* Connect / Cancel Buttons */}
      <Grid container item spacing={1} sx={{ flexFlow: 'column', alignItems: 'center' }}>
        <Grid container item xs={12} md={8} lg={6}>
          <Button fullWidth variant="contained" color="primary" size="large" onClick={onConnectClick}>
            {translate('app.action.connect')}
          </Button>
        </Grid>
        <Grid container item xs={12} md={8} lg={6}>
          <Button fullWidth variant="contained" color="secondary" size="large" onClick={onCancelClick}>
            {translate('ra.action.cancel')}
          </Button>
        </Grid>
      </Grid>
    </SimpleBox>
  );
};

export default InvitePageViewLoggedIn;
