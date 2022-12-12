import React, { useMemo } from 'react';
import { ThemeProvider } from '@material-ui/core';
import ProfileCreatePageView from "./ProfileCreatePageView";
import theme from "../../config/theme";
import {useGetIdentity, EditBase } from "react-admin";

const ProfileCreatePage = (props) => {
  const { identity } = useGetIdentity();


  console.log('props', props)

  // const onSuccess = useCallback(() => {
  //   const redirectUrl = searchParams.get('redirect');
  //   if (!redirectUrl) {
  //     redirect('/')
  //   } else if (redirectUrl.startsWith('/')) {
  //     console.log('redirect', redirectUrl)
  //     redirect(redirectUrl)
  //   } else if (redirectUrl.startsWith('http')) {
  //     window.location = redirectUrl;
  //   }
  // }, [searchParams, redirect]);

  if (!identity) return null;

  return (
    <ThemeProvider theme={theme}>
      <EditBase resource="Profile" basePath="/Profile" id={identity?.profileData.id}>
        <ProfileCreatePageView {...props} />
      </EditBase>
    </ThemeProvider >
  );
}

export default ProfileCreatePage;
