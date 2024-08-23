import { Typography, Button, Grid } from '@mui/material';
import React, { useEffect } from 'react';
import { useGetOne, useLocaleState, useNotify, useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { ACTIVITY_TYPES, useOutbox } from '@semapps/activitypub-components';
import { formatUsername } from '../../utils';
import ConnectAvatars from './ConnectAvatars';
import SimpleBox from '../../layout/SimpleBox';

const InvitePageViewLoggedIn = ({
  inviterProfile,
  ownProfile,
  onConnectClick,
  onCancelClick,
  capabilityUri
}: {
  inviterProfile: any;
  ownProfile: any;
  onConnectClick: () => void;
  onCancelClick: () => void;
  capabilityUri: string;
}) => {
  const notify = useNotify();
  const navigate = useNavigate();
  const outbox = useOutbox();
  const [locale] = useLocaleState();
  const translate = useTranslate();

  const { 'vcard:given-name': inviterFirstName, describes: inviterWebId } = inviterProfile;
  const memberSince = new Date(inviterProfile['dc:created']);

  // The profile was fetched with a capability. Check if it's in our profile list already (i.e. user is already connected).
  const { isSuccess: profileIsConnected } = useGetOne('Profile', { id: inviterProfile.id });
  useEffect(() => {
    if (profileIsConnected) {
      notify('app.notification.already_connected', { autoHideDuration: 5000, type: 'warning' });
      // It might be, that the inviter does not have the user's profile in their profile list.
      // So, we send the Accept > Offer > Add > Profile anyways (triggered by onConnectClicked).
      outbox
        .post({
          '@context': 'https://activitypods.org/context.json',
          type: ACTIVITY_TYPES.OFFER,
          actor: ownProfile.describes,
          to: inviterProfile.describes,
          target: inviterProfile.describes,
          object: {
            type: ACTIVITY_TYPES.ADD,
            object: ownProfile.id
          },
          'sec:capability': capabilityUri
        })
        .then(() => {
          navigate(`/network/${inviterProfile.describes}`);
        });
    }
  }, [profileIsConnected]);

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
          </Typography>
        </Grid>
      </Grid>

      {/* Connect / Cancel Buttons */}
      <Grid container item spacing={1} sx={{ flexFlow: 'column', alignItems: 'center', mt: 1 }}>
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
