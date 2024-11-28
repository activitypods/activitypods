import React, { useState, useCallback } from 'react';
import {
  SimpleForm,
  TextInput,
  ImageField,
  useGetIdentity,
  useNotify,
  useTranslate,
  useCreatePath,
  useRecordContext,
  ShowButton
} from 'react-admin';
import { Link } from 'react-router-dom';
import { Box, Alert } from '@mui/material';
import { ImageInput } from '@semapps/input-components';
import Edit from '../../layout/Edit';
import BlockAnonymous from '../../common/BlockAnonymous';
import QuickCreateLocationInput from '../../common/inputs/QuickCreateLocationInput/QuickCreateLocationInput';
import ToolbarWithoutDelete from '../../common/ToolbarWithoutDelete';

const PrivateProfileWarning = () => {
  const translate = useTranslate();
  const record = useRecordContext();
  const createPath = useCreatePath();

  return (
    <Box mb={1} width="100%">
      <Alert severity="warning">
        {translate('app.helper.private_profile_view')}
        &nbsp;
        <Link to={createPath({ resource: 'Actor', id: record?.describes, type: 'edit' })} style={{ color: 'inherit' }}>
          {translate('app.action.view_public_profile')}
        </Link>
      </Alert>
    </Box>
  );
};

export const ProfileEdit = () => {
  const notify = useNotify();
  const translate = useTranslate();

  const { refetch: refetchIdentity } = useGetIdentity();

  // Needed to trigger orm change and enable save button :
  // https://codesandbox.io/s/react-admin-v3-advanced-recipes-quick-createpreview-voyci
  const [locationVersion, setLocationVersion] = useState(0);
  const handleLocationChange = useCallback(() => {
    setLocationVersion(locationVersion + 1);
  }, [locationVersion]);

  return (
    <BlockAnonymous>
      <Edit
        title={translate('app.setting.private_profile')}
        transform={data => ({ ...data, 'vcard:fn': data['vcard:given-name'] })}
        mutationMode="pessimistic"
        mutationOptions={{
          onSuccess: () => {
            notify('ra.notification.updated', {
              messageArgs: { smart_count: 1 },
              undoable: false
            });
            refetchIdentity();
          }
        }}
        actions={[<ShowButton />]}
      >
        <SimpleForm toolbar={<ToolbarWithoutDelete />}>
          <PrivateProfileWarning />
          <TextInput source="vcard:given-name" fullWidth />
          <TextInput source="vcard:note" fullWidth />
          <ImageInput source="vcard:photo" accept="image/*">
            <ImageField source="src" />
          </ImageInput>
          <QuickCreateLocationInput
            version={locationVersion}
            reference="Location"
            source="vcard:hasAddress"
            onChange={handleLocationChange}
          />
        </SimpleForm>
      </Edit>
    </BlockAnonymous>
  );
};

export default ProfileEdit;
