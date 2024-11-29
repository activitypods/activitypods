/* eslint-disable react/prop-types */
import { Typography, Avatar, Button, Grid } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';

import React from 'react';
import { useLocaleState, useTranslate } from 'react-admin';
import { formatUsername } from '../../utils';
import SimpleBox from '../../layout/SimpleBox';

const InvitePageViewLoggedOut = ({
  profileData,
  onCreateProfileClick,
  onLoginClick
}: {
  profileData: any;
  onCreateProfileClick: () => void;
  onLoginClick: () => void;
}) => {
  const {
    'vcard:given-name': firstName,
    'vcard:photo': avatarSrc,
    describes: inviterWebId,
    'dc:created': memberSince
  } = profileData;
  const [locale] = useLocaleState();
  const memberSinceDate = new Date(memberSince);
  const translate = useTranslate();

  return (
    <SimpleBox
      title={translate('app.page.invite', { username: firstName })}
      infoText={
        <span>
          {translate('app.helper.invite_text_logged_out')}
          &nbsp;
          <a href="https://activitypods.org/" target="_blank" rel="noopener noreferrer">
            {translate('app.helper.more_about_pods')}
          </a>
        </span>
      }
    >
      {/* Avatar */}
      <Grid container item flexDirection="column" alignItems="center">
        <Grid item>
          <Avatar src={avatarSrc} sx={{ width: 'min(50vw, 12rem)', height: 'min(50vw, 12rem)' }}>
            <PersonIcon sx={{ width: 'min(50vw, 12rem)', height: 'min(50vw, 12rem)' }} />
          </Avatar>
        </Grid>
        <Grid item>
          <Typography align="center">{formatUsername(inviterWebId)}</Typography>
        </Grid>
        <Grid item display="flex" justifyContent="center">
          <Typography variant="body2" component="label">
            {translate('app.user.member_since')}
            &nbsp;
            {memberSinceDate.toLocaleDateString(locale, {
              dateStyle: 'medium'
            })}
          </Typography>
        </Grid>
      </Grid>

      {/* Buttons */}
      <Grid container item pt={2} spacing={1} sx={{ flexFlow: 'column', alignItems: 'center' }}>
        <Grid container item xs={12} md={8} lg={6}>
          <Button fullWidth variant="contained" color="primary" size="large" onClick={onCreateProfileClick}>
            {translate('app.helper.signup')}
          </Button>
        </Grid>
        <Grid container item xs={12} md={8} lg={6}>
          <Button fullWidth variant="contained" color="primary" size="large" onClick={onLoginClick}>
            {translate('app.helper.login')}
          </Button>
        </Grid>
      </Grid>
    </SimpleBox>
  );
};

export default InvitePageViewLoggedOut;
