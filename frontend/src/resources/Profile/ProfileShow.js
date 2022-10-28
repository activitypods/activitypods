import React from 'react';
import { TextField, ImageField } from 'react-admin';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import Show from "../../layout/Show";
import ProfileTitle from "./ProfileTitle";

const ProfileShow = (props) => {
  useCheckAuthenticated();
  return (
    <Show title={<ProfileTitle />} {...props}>
      <TextField source="vcard:note" />
      <ImageField source="vcard:photo" />
    </Show>
  );
};

export default ProfileShow;
