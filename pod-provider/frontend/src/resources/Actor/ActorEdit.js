import React, { useCallback } from 'react';
import {
  SimpleForm,
  TextInput,
  ImageField,
  useGetIdentity,
  useNotify,
  Button,
  useDataProvider,
  useTranslate,
  useCreatePath,
  useRecordContext
} from 'react-admin';
import { Link } from 'react-router-dom';
import { Box, Alert } from '@mui/material';
import { ImageInput } from '@semapps/input-components';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Edit from '../../layout/Edit';
import BlockAnonymous from '../../common/BlockAnonymous';
import ToolbarWithoutDelete from '../../common/ToolbarWithoutDelete';
import useWebfingerId from '../../hooks/useWebfingerId';

const PublicProfileWarning = () => {
  const translate = useTranslate();
  const record = useRecordContext();
  const createPath = useCreatePath();

  return (
    <Box mb={1} width="100%">
      <Alert severity="warning">
        {translate('app.helper.public_profile_view')}
        &nbsp;
        <Link to={createPath({ resource: 'Profile', id: record?.url, type: 'edit' })} style={{ color: 'inherit' }}>
          {translate('app.action.view_private_profile')}
        </Link>
      </Alert>
    </Box>
  );
};

const ShowPublicProfileButton = props => {
  const record = useRecordContext();
  const webfingerId = useWebfingerId(record?.id);
  return (
    <Button label="ra.action.show" href={`/network/${webfingerId}?public=true`} {...props}>
      <VisibilityIcon />
    </Button>
  );
};

export const ActorEdit = () => {
  const notify = useNotify();
  const translate = useTranslate();
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
      <Edit
        title={translate('app.setting.public_profile')}
        transform={transform}
        mutationMode="pessimistic"
        mutationOptions={{ onSuccess }}
        actions={[<ShowPublicProfileButton />]}
      >
        <SimpleForm toolbar={<ToolbarWithoutDelete />}>
          <PublicProfileWarning />
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
