import React from 'react';
import { ImageInput, SimpleForm, TextInput } from "react-admin";
import { ImageField } from "@semapps/field-components";
import Edit from '../../layout/Edit';
import ProfileTitle from "./ProfileTitle";

export const ProfileEdit = (props) => (
  <Edit title={<ProfileTitle />} transform={(data) => ({ ...data, 'vcard:fn': data['vcard:given-name'] })} {...props}>
    <SimpleForm {...props}>
      <TextInput source="vcard:given-name" fullWidth />
      <TextInput source="vcard:note" fullWidth />
      <ImageInput source="vcard:photo" accept="image/*">
        <ImageField source="src" />
      </ImageInput>
    </SimpleForm>
  </Edit>
);

export default ProfileEdit;
