import React, { useCallback, useState, useEffect, useMemo } from 'react';
import urlJoin from 'url-join';
import LinkHeader from 'http-link-header';
import { useTranslate, useGetList, useGetMany, useDataProvider, useGetIdentity, useLocaleState } from 'react-admin';
import {
  Box,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Select,
  MenuItem,
  Autocomplete,
  TextField,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent
} from '@mui/material';
import { useContainerByUri, useCompactPredicate } from '@semapps/semantic-data-provider';
import ShareIcon from '@mui/icons-material/Share';
import GroupsIcon from '@mui/icons-material/Groups';
import SimpleBox from '../../layout/SimpleBox';
import useResource from '../../hooks/useResource';
import useRoleLabel from '../../hooks/useRoleLabel';
import useFetchShapeTree from '../../hooks/useFetchShapeTree';
import { arrayOf, formatUsername, isGroupActor, withoutOwnerRole } from '../../utils';

const ACCESS_MODES = {
  none: [],
  read: ['acl:Read'],
  read_write: ['acl:Read', 'acl:Write']
};

const getAccess = (accessModes: string[]) =>
  accessModes.includes('acl:Write') ? 'read_write' : accessModes.includes('acl:Read') ? 'read' : 'none';

type Grantee = {
  uri: string;
  label: string;
  secondary?: string;
  image?: string;
  isRole?: boolean;
  isAdmin?: boolean;
  isGroup?: boolean;
};

const GranteeAvatar = ({ grantee }: { grantee: Grantee }) => (
  <Avatar src={grantee.image}>{grantee.isRole ? <GroupsIcon /> : grantee.label?.toUpperCase()?.[0]}</Avatar>
);

// The people and roles with whom the data may be shared
const useGrantees = (authorizations: any): Grantee[] => {
  const translate = useTranslate();
  const roleLabel = useRoleLabel();
  const { data: identity } = useGetIdentity();
  const isGroup = !!authorizations?.roles;

  const { data: socialAgentRegistrations } = useGetList(
    'SocialAgentRegistration',
    { pagination: { page: 1, perPage: Infinity } },
    { enabled: !!authorizations && !isGroup }
  );

  const agentsUris: string[] = useMemo(
    () =>
      (isGroup
        ? authorizations.members
        : (socialAgentRegistrations || []).map((reg: any) => reg['interop:registeredAgent'])
      ).filter((uri: string) => uri !== identity?.id),
    [isGroup, authorizations, socialAgentRegistrations, identity]
  );

  const { data: actors } = useGetMany('Actor', { ids: agentsUris }, { enabled: agentsUris.length > 0 });

  // The private profiles are only readable for contacts
  const profilesUris: string[] = useMemo(() => (actors || []).map((a: any) => a?.url).filter(Boolean), [actors]);
  const { data: profiles } = useGetMany(
    'Profile',
    { ids: profilesUris },
    { enabled: profilesUris.length > 0, retry: false }
  );

  return useMemo(
    () => [
      ...withoutOwnerRole(authorizations?.roles || []).map((role: any) => ({
        uri: role.uri,
        label: roleLabel(role),
        secondary: translate('app.group.role'),
        isRole: true,
        isAdmin: role.isAdmin
      })),
      ...agentsUris.map(uri => {
        const actor = actors?.find((a: any) => a.id === uri);
        const profile = profiles?.find((p: any) => p.id === actor?.url);
        const isGroupGrantee = isGroupActor(actor);
        return {
          uri,
          label:
            profile?.['vcard:given-name'] || actor?.name || actor?.['foaf:nick'] || actor?.preferredUsername || uri,
          secondary: isGroupGrantee ? translate('app.helper.share_with_group_members') : formatUsername(uri),
          image: profile?.['vcard:photo'] || actor?.icon?.url,
          isGroup: isGroupGrantee
        };
      })
    ],
    [authorizations, agentsUris, actors, profiles, roleLabel, translate]
  );
};

type ShareFormProps = {
  resourceUri?: string | null;
  shapeTreeUri?: string | null;
  podOwner?: string | null;
  onDone: () => void;
};

const useShareForm = ({ resourceUri, shapeTreeUri, podOwner, onDone }: ShareFormProps) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const [locale] = useLocaleState();
  const fetchShapeTree = useFetchShapeTree();
  const [shapeTree, setShapeTree] = useState<any>();
  const [dataRegistrationUri, setDataRegistrationUri] = useState<string>();
  const [authorizations, setAuthorizations] = useState<any>();
  const [initialAccess, setInitialAccess] = useState<Record<string, string>>({});
  const [access, setAccess] = useState<Record<string, string>>({});
  const { data: resource, headers } = useResource(resourceUri) as any;
  const grantees = useGrantees(authorizations);
  const isGroup = !!authorizations?.roles;

  useEffect(() => {
    if (shapeTreeUri) fetchShapeTree(shapeTreeUri).then(setShapeTree);
  }, [shapeTreeUri, fetchShapeTree, setShapeTree]);

  // Find data registration (container) URI based on the resource header
  useEffect(() => {
    if (headers) {
      const linkHeader = LinkHeader.parse(headers.get('Link'));
      const dataRegistrationLinkHeader = linkHeader.rel('http://www.w3.org/ns/solid/interop#hasDataRegistration');
      if (dataRegistrationLinkHeader.length > 0) setDataRegistrationUri(dataRegistrationLinkHeader[0].uri);
    }
  }, [headers, setDataRegistrationUri]);

  const container = useContainerByUri(dataRegistrationUri!);
  const labelPredicate = useCompactPredicate(container?.labelPredicate!, resource?.['@context']);

  useEffect(() => {
    const authorizationsUrl = new URL(urlJoin(CONFIG.BACKEND_URL, '.auth-agent/authorizations'));
    if (resourceUri) {
      authorizationsUrl.searchParams.append('resource', resourceUri);
    } else if (shapeTreeUri) {
      authorizationsUrl.searchParams.append('shapeTree', shapeTreeUri);
      if (podOwner) authorizationsUrl.searchParams.append('podOwner', podOwner);
    }

    dataProvider
      .fetch(authorizationsUrl.toString(), { headers: new Headers({ Accept: 'application/json' }) })
      .then(({ json }: any) => {
        const currentAccess = Object.fromEntries([
          ...json.authorizations.map((auth: any) => [auth.grantee, getAccess(arrayOf(auth.accessModes))]),
          // The admins have full access to all the data of the group, which can't be changed
          ...(json.roles || []).filter((role: any) => role.isAdmin).map((role: any) => [role.uri, 'read_write'])
        ]);
        setAuthorizations(json);
        setInitialAccess(currentAccess);
        setAccess(currentAccess);
      });
  }, [resourceUri, shapeTreeUri, podOwner, dataProvider]);

  const onShare = useCallback(async () => {
    const changed = Object.keys(access).filter(grantee => access[grantee] !== (initialAccess[grantee] || 'none'));
    if (changed.length > 0) {
      await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.auth-agent/authorizations'), {
        method: 'PUT',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...(resourceUri ? { resourceUri } : { shapeTreeUri, podOwner }),
          authorizations: changed.map(grantee => ({
            grantee,
            accessModes: ACCESS_MODES[access[grantee] as keyof typeof ACCESS_MODES]
          }))
        })
      });
    }
    onDone();
  }, [resourceUri, shapeTreeUri, podOwner, access, initialAccess, dataProvider, onDone]);

  const text = shapeTreeUri
    ? translate(isGroup ? 'app.helper.share_type_group' : 'app.helper.share_type', {
        typeName: shapeTree?.label?.[locale] || shapeTree?.types?.join(', ') || ''
      })
    : translate(isGroup ? 'app.helper.share_group' : 'app.helper.share', {
        // The containers of a group are not in the user's data servers
        resourceName: (labelPredicate && resource?.[labelPredicate]) || resource?.name || ''
      });

  return { authorizations, grantees, access, setAccess, onShare, text, isGroup };
};

const ShareFormContent = ({ form, inDialog }: { form: ReturnType<typeof useShareForm>; inDialog?: boolean }) => {
  const translate = useTranslate();
  const { authorizations, grantees, access, setAccess, isGroup } = form;

  const withAccess = grantees.filter(grantee => access[grantee.uri] && access[grantee.uri] !== 'none');
  const options = grantees.filter(grantee => !withAccess.includes(grantee));

  if (!authorizations) return null;

  return (
    <>
      <Autocomplete
        options={options}
        value={null}
        blurOnSelect
        getOptionLabel={(option: Grantee) => option.label}
        filterOptions={(opts, { inputValue }) =>
          opts.filter(o => `${o.label} ${o.secondary || ''}`.toLowerCase().includes(inputValue.toLowerCase()))
        }
        onChange={(e, grantee: Grantee | null) => {
          if (grantee) setAccess(cur => ({ ...cur, [grantee.uri]: 'read' }));
        }}
        renderOption={(props, option) => (
          <ListItem {...props} key={option.uri}>
            <ListItemAvatar>
              <GranteeAvatar grantee={option} />
            </ListItemAvatar>
            <ListItemText primary={option.label} secondary={option.secondary} />
          </ListItem>
        )}
        renderInput={params => (
          <TextField
            {...params}
            size="small"
            label={translate(isGroup ? 'app.input.share_search_group' : 'app.input.share_search')}
          />
        )}
        sx={{ mt: inDialog ? 0 : 2 }}
      />
      {withAccess.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {translate('app.helper.no_access')}
        </Typography>
      )}
      <List sx={{ width: '100%' }}>
        {withAccess.map(grantee => (
          <ListItem
            key={grantee.uri}
            sx={{ px: 0 }}
            secondaryAction={
              <Select
                size="small"
                value={access[grantee.uri]}
                disabled={grantee.isAdmin}
                onChange={e => setAccess(cur => ({ ...cur, [grantee.uri]: e.target.value }))}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="read">{translate('app.authorization.read')}</MenuItem>
                <MenuItem value="read_write">{translate('app.authorization.read_write')}</MenuItem>
                <MenuItem value="none">{translate('app.authorization.remove')}</MenuItem>
              </Select>
            }
          >
            <ListItemAvatar>
              <GranteeAvatar grantee={grantee} />
            </ListItemAvatar>
            <ListItemText primary={grantee.label} secondary={grantee.secondary} sx={{ pr: 18 }} />
          </ListItem>
        ))}
      </List>
    </>
  );
};

const ShareButtons = ({ onShare, onCancel }: { onShare: () => void; onCancel: () => void }) => {
  const translate = useTranslate();
  return (
    <Box display="flex" justifyContent="end">
      <Button color="secondary" onClick={onCancel} sx={{ ml: 1 }}>
        {translate('ra.action.cancel')}
      </Button>
      <Button variant="contained" color="secondary" onClick={onShare} sx={{ ml: 1 }}>
        {translate('app.action.share')}
      </Button>
    </Box>
  );
};

// Share screen opened by an application
const ShareScreen = ({ resourceUri, shapeTreeUri, podOwner, accessApp }: any) => {
  const translate = useTranslate();
  const form = useShareForm({ resourceUri, shapeTreeUri, podOwner, onDone: accessApp });

  return (
    <SimpleBox title={translate('app.page.share')} icon={<ShareIcon />} text={form.text}>
      <ShareFormContent form={form} />
      <ShareButtons onShare={form.onShare} onCancel={accessApp} />
    </SimpleBox>
  );
};

const ShareDialogContent = ({ onClose, ...props }: Omit<ShareFormProps, 'onDone'> & { onClose: () => void }) => {
  const translate = useTranslate();
  const form = useShareForm({ ...props, onDone: onClose });

  return (
    <>
      <DialogTitle sx={{ pb: 1 }}>{translate('app.action.manage_access')}</DialogTitle>
      <DialogContent>
        <ShareFormContent form={form} inDialog />
        <ShareButtons onShare={form.onShare} onCancel={onClose} />
      </DialogContent>
    </>
  );
};

export const ShareDialog = ({
  open,
  onClose,
  ...props
}: Omit<ShareFormProps, 'onDone'> & { open: boolean; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
    {open && <ShareDialogContent onClose={onClose} {...props} />}
  </Dialog>
);

export default ShareScreen;
