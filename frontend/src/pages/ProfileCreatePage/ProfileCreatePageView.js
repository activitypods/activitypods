import React, { useMemo } from 'react';
import {
  TextInput,
  SimpleForm,
  Toolbar,
  SaveButton, 
  useTranslate,
  ImageField
} from 'react-admin';
import { ImageInput } from '@semapps/input-components';
import { useSearchParams } from 'react-router-dom';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import SimpleBox from "../../layout/SimpleBox";

const ToolbarWithoutDelete = props => (
  <Toolbar {...props} >
    <SaveButton />
  </Toolbar>
);

const ProfileCreatePageView = () => {
  const translate = useTranslate();
  const [searchParams] = useSearchParams();

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
      <SimpleForm redirect={redirect} toolbar={<ToolbarWithoutDelete />}>
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
