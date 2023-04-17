import React from 'react';
import { ImageInput, SaveButton, SimpleForm, TextInput, Toolbar, useTranslate } from "react-admin";
import { ImageField } from "@semapps/field-components";
import Edit from '../../layout/Edit';
import ProfileTitle from "./ProfileTitle";
import { g1PublicKeyToUrl, g1UrlToPublicKey } from "../../utils";
import BlockAnonymous from "../../common/BlockAnonymous";
import LocationInput from "../../common/inputs/LocationInput";

const ToolbarWithoutDelete = props => (
  <Toolbar {...props} >
    <SaveButton />
  </Toolbar>
);

export const ProfileEdit = (props) => {
  const translate = useTranslate();
  return (
    <BlockAnonymous>
      <Edit title={<ProfileTitle />} transform={(data) => ({ ...data, 'vcard:fn': data['vcard:given-name'] })} {...props}>
        <SimpleForm {...props} toolbar={<ToolbarWithoutDelete />}>
          <TextInput source="vcard:given-name" fullWidth />
          <TextInput source="vcard:note" fullWidth />
          <ImageInput source="vcard:photo" accept="image/*">
            <ImageField source="src" />
          </ImageInput>
          <TextInput
            source="foaf:tipjar"
            parse={v => g1PublicKeyToUrl(v)}
            format={v => g1UrlToPublicKey(v)}
            helperText={translate('app.helper.g1_tipjar_input')}
            fullWidth
          />
          <LocationInput reference="Location" source="vcard:hasAddress" fullWidth />
        </SimpleForm>
      </Edit>
    </BlockAnonymous>
  );
}

export default ProfileEdit;
