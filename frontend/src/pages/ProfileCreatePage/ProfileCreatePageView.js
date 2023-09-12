import React from 'react';
import { TextInput, SimpleForm, Toolbar, SaveButton, useTranslate, ImageField } from 'react-admin';
import { ImageInput } from '@semapps/input-components';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import SimpleBox from '../../layout/SimpleBox';

const ToolbarWithoutDelete = (props) => (
  <Toolbar {...props}>
    <SaveButton />
  </Toolbar>
);

const ProfileCreatePageView = () => {
  const translate = useTranslate();
  return (
    <SimpleBox
      title={translate('app.page.create_profile')}
      icon={<AccountCircleIcon />}
      text={translate('app.helper.create_profile')}
    >
      <SimpleForm toolbar={<ToolbarWithoutDelete />}>
        <TextInput source="vcard:given-name" fullWidth />
        <TextInput source="vcard:note" fullWidth />
        <ImageInput source="vcard:photo" accept="image/*">
          <ImageField source="src" />
        </ImageInput>
      </SimpleForm>
    </SimpleBox>
  );
};

export default ProfileCreatePageView;
