import React, { useState, useCallback } from 'react';
import { SimpleForm, TextInput, ImageField, useGetIdentity, useNotify, useTranslate, ShowButton } from 'react-admin';
import { Link } from 'react-router-dom';
import { Box, Alert } from '@mui/material';
import { ImageInput } from '@semapps/input-components';
import Edit from '../../../layout/Edit';
import BlockAnonymous from '../../../common/BlockAnonymous';
import QuickCreateLocationInput from '../../../common/inputs/QuickCreateLocationInput/QuickCreateLocationInput';
import ToolbarWithoutDelete from '../../../common/ToolbarWithoutDelete';

const PrivateProfileWarning = () => {
  const translate = useTranslate();
  return (
    <Box mb={1} width="100%">
      <Alert severity="warning">
        {translate('app.helper.private_profile_view')}
        &nbsp;
        <Link to="../public" style={{ color: 'inherit' }}>
          {translate('app.action.view_public_profile')}
        </Link>
      </Alert>
    </Box>
  );
};

export const PrivateProfilePage = () => {
  const notify = useNotify();
  const translate = useTranslate();
  const { data: identity, refetch: refetchIdentity } = useGetIdentity();

  // Needed to trigger orm change and enable save button :
  // https://codesandbox.io/s/react-admin-v3-advanced-recipes-quick-createpreview-voyci
  const [locationVersion, setLocationVersion] = useState(0);
  const handleLocationChange = useCallback(() => {
    setLocationVersion(locationVersion + 1);
  }, [locationVersion]);

  const onSuccess = useCallback(() => {
    notify('ra.notification.updated', {
      messageArgs: { smart_count: 1 },
      undoable: false
    });
    // @ts-expect-error TS(2722): Cannot invoke an object which is possibly 'undefin... Remove this comment to see the full error message
    refetchIdentity();
  }, [notify, refetchIdentity]);

  return (
    <BlockAnonymous>
      <Edit
        title={translate('app.setting.private_profile')}
        resource="Profile"
        id={identity?.profileData?.id}
        transform={(data: any) => ({
          ...data,
          'vcard:fn': data['vcard:given-name']
        })}
        mutationMode="pessimistic"
        mutationOptions={{ onSuccess }}
        actions={[<ShowButton />]}
      >
        <SimpleForm toolbar={<ToolbarWithoutDelete />}>
          <PrivateProfileWarning />
          <TextInput source="vcard:given-name" fullWidth />
          <TextInput source="vcard:note" fullWidth />
          <ImageInput source="vcard:photo" accept="image/*">
            <ImageField source="src" />
          </ImageInput>
          {CONFIG.MAPBOX_ACCESS_TOKEN && (
            <QuickCreateLocationInput
              version={locationVersion}
              reference="Location"
              source="vcard:hasAddress"
              onChange={handleLocationChange}
            />
          )}
        </SimpleForm>
      </Edit>
    </BlockAnonymous>
  );
};

export default PrivateProfilePage;
