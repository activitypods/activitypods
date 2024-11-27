import React, { useCallback } from 'react';
import { SimpleForm, TextInput, ImageField, useGetIdentity, useNotify, ShowButton, useDataProvider } from 'react-admin';
import { ImageInput } from '@semapps/input-components';
import Edit from '../../layout/Edit';
import BlockAnonymous from '../../common/BlockAnonymous';
import ToolbarWithoutDelete from '../../common/ToolbarWithoutDelete';

export const ActorEdit = () => {
  const notify = useNotify();
  const { data: identity, refetch: refetchIdentity } = useGetIdentity();
  const dataProvider = useDataProvider();

  const transform = useCallback(
    async ({ icon, ...rest }) => {
      if (icon?.rawFile) {
        const iconUrl = await dataProvider.uploadFile(icon.rawFile);
        icon = {
          type: 'Image',
          mediaType: icon.rawFile?.type,
          url: iconUrl
        };
      } else if (icon?.fileToDelete) {
        await dataProvider.fetch(icon.fileToDelete.url, { method: 'DELETE' });
        icon = null;
      }
      return {
        ...rest,
        // Disabled inputs are not passed so we need to pass it manually
        preferredUsername: identity?.webIdData?.preferredUsername,
        icon
      };
    },
    [identity, dataProvider]
  );

  const onSuccess = useCallback(() => {
    notify('ra.notification.updated', {
      messageArgs: { smart_count: 1 },
      undoable: false
    });
    refetchIdentity();
  }, [notify, refetchIdentity]);

  return (
    <BlockAnonymous>
      <Edit transform={transform} mutationMode="pessimistic" mutationOptions={{ onSuccess }} actions={[<ShowButton />]}>
        <SimpleForm toolbar={<ToolbarWithoutDelete />}>
          <TextInput
            source="preferredUsername"
            fullWidth
            disabled
            helperText="app.helper.username_cannot_be_modified"
          />
          <TextInput source="name" fullWidth />
          <TextInput source="summary" fullWidth />
          <ImageInput
            source="icon"
            accept="image/*"
            format={v => {
              console.log('v', v);
              if (v?.url) {
                return { src: v.url };
              } else if (v?.fileToDelete) {
                return {};
              } else {
                return v;
              }
            }}
          >
            <ImageField source="src" />
          </ImageInput>
        </SimpleForm>
      </Edit>
    </BlockAnonymous>
  );
};

export default ActorEdit;
