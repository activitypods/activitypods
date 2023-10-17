import { Button, Grid, Typography } from '@mui/material';
import React, { useCallback } from 'react';
import { useTranslate } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import ConnectAvatars from './ConnectAvatars';
import SimpleBox from '../../layout/SimpleBox';

const InvitePageSuccess = ({ inviterProfile, ownProfile }: { inviterProfile: any; ownProfile: any }) => {
  const translate = useTranslate();
  const navigate = useNavigate();

  const onContinue = useCallback(async () => {
    // Get the inviter's profile URI in the current users's profiles container.
    navigate(`/Profile/${encodeURIComponent(inviterProfile.id)}/show`);
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
      <Grid container item xs={12} md={8} lg={6} justifyItems="center" alignSelf="center">
        <Button fullWidth onClick={onContinue} variant="contained" color="primary" size="large">
          {translate('app.action.continue')}
        </Button>
      </Grid>
    </SimpleBox>
  );
};

export default InvitePageSuccess;
