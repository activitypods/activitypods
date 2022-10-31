import React from 'react';
import { TextField, ImageField } from 'react-admin';
import Show from "../../layout/Show";
import ProfileTitle from "./ProfileTitle";

const ProfileShow = (props) => (
  <Show title={<ProfileTitle />} {...props}>
    <TextField source="vcard:note" />
    <ImageField source="vcard:photo" />
  </Show>
);

export default ProfileShow;
