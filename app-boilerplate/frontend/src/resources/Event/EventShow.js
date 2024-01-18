import React from 'react';
import { Show, SimpleShowLayout, TextField, DateField } from 'react-admin';

const ProfileShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="name" />
      <TextField source="content" />
      <DateField source="startTime" />
    </SimpleShowLayout>
  </Show>
);

export default ProfileShow;
