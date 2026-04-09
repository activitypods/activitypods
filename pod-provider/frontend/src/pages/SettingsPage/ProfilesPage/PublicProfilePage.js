import React, { useCallback, useMemo, useState } from 'react';
import {
  SimpleForm,
  TextInput,
  ImageField,
  useNotify,
  Button,
  useDataProvider,
  useTranslate,
  useRecordContext,
  ArrayInput,
  SimpleFormIterator,
  SelectInput,
  BooleanInput,
  SaveButton,
  Toolbar
} from 'react-admin';
import { Link } from 'react-router-dom';
import { Box, Alert, Card, Chip, Stack, Typography } from '@mui/material';
import { ImageInput } from '@semapps/input-components';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VerifiedIcon from '@mui/icons-material/Verified';
import LinkIcon from '@mui/icons-material/Link';
import urlJoin from 'url-join';
import BlockAnonymous from '../../../common/BlockAnonymous';
import useWebfingerId from '../../../hooks/useWebfingerId';
import useRealmContext from '../../../hooks/useRealmContext';
import {
  buildProfileFormDefaults,
  createEmptyProfileField,
  mergeProfileFieldsIntoAttachment
} from '../../../profileMetadata';

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

const ShowPublicProfileButton = props => {
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
  const { isGroup, data, isLoading, refetch } = useRealmContext();
  const dataProvider = useDataProvider();
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const defaultValues = useMemo(() => buildProfileFormDefaults(data?.webIdData || {}), [data]);

  const onSubmit = useCallback(
    async ({ name, icon, metadataFields = [], ...rest }) => {
      try {
        let nextIcon = icon;

        if (icon?.rawFile) {
          const iconUrl = await dataProvider.uploadFile(icon.rawFile);
          nextIcon = {
            type: 'Image',
            mediaType: icon.rawFile?.type,
            url: iconUrl
          };
        } else if (icon?.fileToDelete) {
          await dataProvider.fetch(icon.fileToDelete.url, { method: 'DELETE' });
          nextIcon = null;
        }

        const attachment = mergeProfileFieldsIntoAttachment(data?.webIdData?.attachment, metadataFields);

        await dataProvider.update('Actor', {
          id: data?.id,
          data: {
            ...data?.webIdData,
            ...rest,
            name,
            'foaf:name': name,
            preferredUsername: data?.webIdData?.preferredUsername,
            icon: nextIcon,
            attachment
          },
          previousData: data?.webIdData
        });

        notify('ra.notification.updated', {
          messageArgs: { smart_count: 1 },
          undoable: false
        });
        setVerificationResult(null);
        await refetch();
      } catch (error) {
        notify(error.message || 'app.notification.update_settings_error', { type: 'error' });
      }
    },
    [data, dataProvider, notify, refetch]
  );

  const onVerifyLinks = useCallback(async () => {
    try {
      setIsVerifying(true);
      const response = await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, 'api/actor-metadata/verify'), {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ actorUri: data?.id })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || translate('app.notification.profile_metadata_verify_failed'));
      }

      setVerificationResult(payload);
      notify('app.notification.profile_metadata_verified', { type: 'success' });
    } catch (error) {
      notify('app.notification.profile_metadata_verify_failed', {
        type: 'error',
        messageArgs: { error: String(error?.message || error) }
      });
    } finally {
      setIsVerifying(false);
    }
  }, [data, dataProvider, notify, translate]);

  const renderVerificationSummary = () => {
    if (!verificationResult) return null;

    const links = Array.isArray(verificationResult.links) ? verificationResult.links : [];
    const verifiedCount = verificationResult.summary?.verifiedCount || 0;
    const total = verificationResult.summary?.totalRelMeLinks || 0;

    return (
      <Box mt={2}>
        <Alert severity={verifiedCount > 0 ? 'success' : 'info'}>
          {translate('app.message.profile_metadata_verification_summary', {
            verified: verifiedCount,
            total
          })}
        </Alert>
        {links.length > 0 && (
          <Stack spacing={1} mt={1.5}>
            {links.map(link => (
              <Box
                key={link.href}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  flexWrap: 'wrap'
                }}
              >
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {link.href}
                </Typography>
                <Chip
                  size="small"
                  color={link.verified ? 'success' : 'default'}
                  icon={link.verified ? <VerifiedIcon /> : <LinkIcon />}
                  label={link.verified ? translate('app.message.verified') : link.reason}
                />
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    );
  };

  const ProfileToolbar = () => (
    <Toolbar>
      <SaveButton />
    </Toolbar>
  );

  const ProfileActions = () => (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mb={2}>
      {!isGroup && <ShowPublicProfileButton />}
      <Button label="app.action.verify_profile_links" onClick={onVerifyLinks} disabled={isVerifying}>
        <VerifiedIcon />
      </Button>
    </Stack>
  );

  if (isLoading) return null;

  return (
    <BlockAnonymous>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2, mb: 2 }}>
        {translate('app.setting.public_profile')}
      </Typography>
      <Card sx={{ p: 2 }}>
        <ProfileActions />
        <SimpleForm defaultValues={defaultValues} onSubmit={onSubmit} toolbar={<ProfileToolbar />}>
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
          )}

          <Box mt={1} width="100%">
            <Typography variant="h6" gutterBottom>
              {translate('app.setting.profile_metadata')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {translate('app.helper.profile_metadata')}
            </Typography>
            <ArrayInput source="metadataFields">
              <SimpleFormIterator
                disableReordering
                inline
                getItemLabel={index => `${translate('app.setting.profile_metadata_field')} ${index + 1}`}
                addButton={<Button label="app.action.add_profile_field" onClick={undefined} />}
              >
                <TextInput source="name" label="app.input.profile_field_label" />
                <SelectInput
                  source="kind"
                  label="app.input.profile_field_type"
                  choices={[
                    { id: 'text', name: translate('app.input.profile_field_type_text') },
                    { id: 'link', name: translate('app.input.profile_field_type_link') }
                  ]}
                />
                <TextInput source="value" label="app.input.profile_field_value" fullWidth />
                <BooleanInput source="relMe" label="app.input.profile_field_rel_me" />
              </SimpleFormIterator>
            </ArrayInput>
            {renderVerificationSummary()}
          </Box>
        </SimpleForm>
      </Card>
    </BlockAnonymous>
  );
};

export default PublicProfilePage;
