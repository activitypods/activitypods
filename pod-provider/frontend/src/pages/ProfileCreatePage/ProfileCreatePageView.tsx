import React from 'react';
import { TextInput, SimpleForm, Toolbar, SaveButton, useTranslate, ImageField } from 'react-admin';
import { ImageInput } from '@semapps/input-components';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { Box, Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link } from 'react-router-dom';
import SimpleBox from '../../layout/SimpleBox';

const ToolbarWithBackButton = (props: any) => {
  const translate = useTranslate();
  return (
    <Toolbar {...props} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, margin: 0 }}>
      <Link to="/login" style={{ textDecoration: 'none' }}>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<ArrowBackIcon />}
          aria-label={translate('ra.action.back')}
        >
          {translate('ra.action.back')}
        </Button>
      </Link>
      <SaveButton />
    </Toolbar>
  );
};

const ProfileCreatePageView = () => {
  const translate = useTranslate();
  return (
    <SimpleBox
      title={translate('app.page.create_profile')}
      icon={<AccountCircleIcon />}
      text={translate('app.helper.create_profile')}
    >
      <SimpleForm
        toolbar={<ToolbarWithBackButton />}
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'Component... Remove this comment to see the full error message
        component="div"
      >
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
