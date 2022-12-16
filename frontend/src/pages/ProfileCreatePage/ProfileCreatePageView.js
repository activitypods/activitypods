import React, { useMemo } from 'react';
import {
  TextInput,
  SimpleForm,
  ImageInput,
  useEditContext,
  Toolbar,
  SaveButton
} from 'react-admin';
import { ImageField } from "@semapps/field-components";
import AccountCircleIcon from '@material-ui/icons/AccountCircle';
import SimpleBox from "../../layout/SimpleBox";

const ToolbarWithoutDelete = props => (
  <Toolbar {...props} >
    <SaveButton />
  </Toolbar>
);

const ProfileCreatePageView = ({ location }) => {
  const searchParams = new URLSearchParams(location.search);
  const editContext = useEditContext();

  const redirect = useMemo(() => {
    const redirectUrl = searchParams.get('redirect');
    if (!redirectUrl) {
      return '/';
    } else if (redirectUrl.startsWith('/')) {
      return redirectUrl;
    } else if (redirectUrl.startsWith('http')) {
      return '/authorize?redirect=' + encodeURIComponent(redirectUrl);
    }
  }, [searchParams]);

  return (
    <SimpleBox
      title="Créez votre profil"
      icon={<AccountCircleIcon />}
      text="Maintenant que votre compte est créé, veuillez créer votre profil. Celui-ci ne sera visible par défaut
            que des personnes que vous acceptez dans votre réseau.">
      <SimpleForm {...editContext} redirect={redirect} toolbar={<ToolbarWithoutDelete />}>
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
