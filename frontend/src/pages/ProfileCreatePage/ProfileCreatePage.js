import React from 'react';
import { ThemeProvider } from '@mui/material';
import ProfileCreatePageView from "./ProfileCreatePageView";
import theme from "../../config/theme";
import {useGetIdentity, EditBase } from "react-admin";

const ProfileCreatePage = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <ThemeProvider theme={theme}>
      <EditBase resource="Profile" basePath="/Profile" id={identity?.profileData?.id} mutationMode="pessimistic">
        <ProfileCreatePageView />
      </EditBase>
    </ThemeProvider >
  );
}

export default ProfileCreatePage;
