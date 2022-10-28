import React from 'react';
import Edit from '../../layout/Edit';
import ProfileForm from './ProfileForm';
import ProfileTitle from "./ProfileTitle";

export const ProfileEdit = (props) => (
  <Edit title={<ProfileTitle />} transform={(data) => ({ ...data, 'vcard:fn': data['vcard:given-name'] })} {...props}>
    <ProfileForm />
  </Edit>
);

export default ProfileEdit;
