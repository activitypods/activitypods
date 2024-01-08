import { Button, Grid, Typography, CircularProgress } from '@mui/material';
import React, { useCallback } from 'react';
import { useGetOne, useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import ConnectAvatars from './ConnectAvatars';
import SimpleBox from '../../layout/SimpleBox';

const InvitePageSuccess = ({ inviterProfile, ownProfile }: { inviterProfile: any; ownProfile: any }) => {
  const translate = useTranslate();
  const navigate = useNavigate();

  // We need this to check when the profile is actually available
  const { isLoading: profileLoading } = useGetOne('Profile', { id: inviterProfile.id });

  // It takes a while for the new invitee to be authorized to see the profile, so we might have to wait a bit.
  const onContinue = useCallback(() => {
    // Get the inviter's profile URI in the current users's profiles container.
    navigate(`/Profile/${encodeURIComponent(inviterProfile.id as string)}/show`);
  }, []);

  return (
    <SimpleBox title={translate('app.page.invite_success')}>
      {/* Connect Avatars */}
      <Grid container item flexDirection="column" alignSelf="center" alignItems="center" width="fit-content">
        <ConnectAvatars frontProfile={inviterProfile} backProfile={ownProfile} avatarSize="min(45vw, 12rem)" />
      </Grid>

      {/* Success Message */}
      <Grid item display="flex" justifyContent="center">
        <Typography variant="body2" component="label" textAlign="center">
          {translate('app.message.connection_successful')}
        </Typography>
      </Grid>

      {/* Continue Button */}
      <Grid container item xs={12} md={8} lg={6} justifyItems="center" alignSelf="center" sx={{ mt: 2, mb: 2 }}>
        {!profileLoading && (
          <Button fullWidth onClick={onContinue} variant="contained" color="primary" size="large">
            {translate('app.action.continue')}
          </Button>
        )}

        {profileLoading && (
          <Button
            startIcon={<CircularProgress sx={{ scale: '65%' }} />}
            fullWidth
            onClick={onContinue}
            variant="contained"
            color="primary"
            size="large"
            disabled
          >
            {translate('app.action.continue')}
          </Button>
        )}
      </Grid>
    </SimpleBox>
  );
};

export default InvitePageSuccess;
