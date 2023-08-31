import React from 'react';
import { SaveButton, SimpleForm, TextInput, Toolbar, useTranslate, ImageField } from 'react-admin';
import { ImageInput } from '@semapps/input-components';
import Edit from '../../layout/Edit';
import ProfileTitle from './ProfileTitle';
import { g1PublicKeyToUrl, g1UrlToPublicKey } from '../../utils';
import BlockAnonymous from '../../common/BlockAnonymous';
// import QuickCreateLocationInput from '../../common/inputs/QuickCreateLocationInput/QuickCreateLocationInput';

const ToolbarWithoutDelete = (props) => (
  <Toolbar {...props}>
    <SaveButton />
  </Toolbar>
);

export const ProfileEdit = (props) => {
  const translate = useTranslate();
  return (
    <BlockAnonymous>
      <Edit
        title={<ProfileTitle />}
        transform={(data) => ({ ...data, 'vcard:fn': data['vcard:given-name'] })}
        {...props}
      >
        <SimpleForm {...props} toolbar={<ToolbarWithoutDelete />}>
          <TextInput source="vcard:given-name" fullWidth />
          <TextInput source="vcard:note" fullWidth />
          <ImageInput source="vcard:photo" accept="image/*">
            <ImageField source="src" />
          </ImageInput>
          {/* <QuickCreateLocationInput reference="Location" source="vcard:hasAddress" /> */}
          <TextInput
            source="foaf:tipjar"
            parse={(v) => g1PublicKeyToUrl(v)}
            format={(v) => g1UrlToPublicKey(v)}
            helperText={translate('app.helper.g1_tipjar_input')}
            fullWidth
          />
        </SimpleForm>
      </Edit>
    </BlockAnonymous>
  );
};

export default ProfileEdit;
