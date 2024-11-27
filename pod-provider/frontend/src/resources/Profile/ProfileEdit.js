import React, { useState, useCallback } from 'react';
import { SimpleForm, TextInput, ImageField, useGetIdentity, useNotify, ShowButton } from 'react-admin';
import { ImageInput } from '@semapps/input-components';
import Edit from '../../layout/Edit';
import BlockAnonymous from '../../common/BlockAnonymous';
import QuickCreateLocationInput from '../../common/inputs/QuickCreateLocationInput/QuickCreateLocationInput';
import ToolbarWithoutDelete from '../../common/ToolbarWithoutDelete';

export const ProfileEdit = () => {
  const notify = useNotify();
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
