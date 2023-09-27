import React from 'react';
import { ThemeProvider } from '@material-ui/core';
import ProfileCreatePageView from './ProfileCreatePageView';
import theme from '../../config/theme';
import { useGetIdentity, EditBase } from 'react-admin';

const ProfileCreatePage = props => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <ThemeProvider theme={theme}>
      <EditBase resource="Profile" basePath="/Profile" id={identity?.profileData?.id} mutationMode="pessimistic">
        <ProfileCreatePageView {...props} />
      </EditBase>
    </ThemeProvider>
  );
};

export default ProfileCreatePage;
