import React, { useCallback } from 'react';
import {
  SimpleForm,
  TextInput,
  ImageField,
  useNotify,
  Button,
  useDataProvider,
  useTranslate,
  useRecordContext
} from 'react-admin';
import { Link } from 'react-router-dom';
import { Box, Alert } from '@mui/material';
import { ImageInput } from '@semapps/input-components';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Edit from '../../../layout/Edit';
import BlockAnonymous from '../../../common/BlockAnonymous';
import ToolbarWithoutDelete from '../../../common/ToolbarWithoutDelete';
import useWebfingerId from '../../../hooks/useWebfingerId';
import useRealmContext from '../../../hooks/useRealmContext';

const PublicProfileWarning = () => {
  const translate = useTranslate();
  return (
    <Box mb={1} width="100%">
      <Alert severity="warning">
        {translate('app.helper.public_profile_view')}
        &nbsp;
        <Link to="../private" style={{ color: 'inherit' }}>
          {translate('app.action.view_private_profile')}
        </Link>
      </Alert>
    </Box>
  );
};

const ShowPublicProfileButton = (props: any) => {
  const record = useRecordContext();
  const webfingerId = useWebfingerId(record?.id);
  return (
    <Button label="ra.action.show" href={`/network/${webfingerId}?public=true`} {...props}>
      <VisibilityIcon />
    </Button>
  );
};

export const PublicProfilePage = () => {
  const notify = useNotify();
  const translate = useTranslate();
  // @ts-expect-error TS(2339): Property 'isGroup' does not exist on type 'unknown... Remove this comment to see the full error message
  const { isGroup, data, isLoading, refetch } = useRealmContext();

  const dataProvider = useDataProvider();

  const transform = useCallback(
    async ({ name, icon, ...rest }: any) => {
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
        name,
        'foaf:name': name,
        // Disabled inputs are not passed so we need to pass it manually
        preferredUsername: data?.webIdData?.preferredUsername,
        icon
      };
    },
    [data, dataProvider]
  );

  const onSuccess = useCallback(() => {
    notify('ra.notification.updated', {
      messageArgs: { smart_count: 1 },
      undoable: false
    });
    refetch();
  }, [notify, refetch]);

  if (isLoading) return null;

  return (
    <BlockAnonymous>
      <Edit
        title={translate('app.setting.public_profile')}
        resource="Actor"
        id={data?.id}
        transform={transform}
        mutationMode="pessimistic"
        mutationOptions={{ onSuccess }}
        actions={!isGroup ? [<ShowPublicProfileButton />] : []}
      >
        <SimpleForm toolbar={<ToolbarWithoutDelete />}>
          {!isGroup && <PublicProfileWarning />}
          <TextInput
            source="preferredUsername"
            fullWidth
            disabled
            helperText="app.helper.username_cannot_be_modified"
          />
          <TextInput source="name" fullWidth />
          {!isGroup && <TextInput source="summary" fullWidth />}
          {!isGroup && (
            <ImageInput
              source="icon"
              accept={{ 'image/*': [] }}
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
          )}
        </SimpleForm>
      </Edit>
    </BlockAnonymous>
  );
};

export default PublicProfilePage;
