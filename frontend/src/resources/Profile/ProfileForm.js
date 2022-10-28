import React from 'react';
import { ImageInput, TextInput, SimpleForm } from 'react-admin';
import { ImageField } from '@semapps/semantic-data-provider';

export const ProfileForm = (props) => (
  <SimpleForm {...props}>
    <TextInput source="vcard:given-name" fullWidth />
    <TextInput source="vcard:note" fullWidth />
    <ImageInput source="vcard:photo" accept="image/*">
      <ImageField source="src" />
    </ImageInput>
  </SimpleForm>
);

export default ProfileForm;
