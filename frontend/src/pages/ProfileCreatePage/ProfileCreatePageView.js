import React, { useMemo } from 'react';
import {
  TextInput,
  SimpleForm,
  ImageInput,
  useEditContext,
  Toolbar,
  SaveButton, useTranslate
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
  const translate = useTranslate();

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
      title={translate('app.page.create_profile')}
      icon={<AccountCircleIcon />}
      text={translate('app.helper.create_profile')}
    >
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
