import React, { useCallback, useState, useEffect, useMemo } from 'react';
import urlJoin from 'url-join';
import LinkHeader from 'http-link-header';
import {
  useTranslate,
  useGetList,
  useGetMany,
  useDataProvider,
  useGetIdentity,
  useLocaleState,
  useNotify
} from 'react-admin';
import {
  Box,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
  Autocomplete,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent
} from '@mui/material';
import { useContainerByUri, useCompactPredicate } from '@semapps/semantic-data-provider';
import ShareIcon from '@mui/icons-material/Share';
import GroupsIcon from '@mui/icons-material/Groups';
import PublicIcon from '@mui/icons-material/Public';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import SimpleBox from '../../layout/SimpleBox';
import Header from '../../common/Header';
import useResource from '../../hooks/useResource';
import useRoleLabel from '../../hooks/useRoleLabel';
import useFetchShapeTree from '../../hooks/useFetchShapeTree';
import { arrayOf, formatUsername, isGroupActor, withoutOwnerRole } from '../../utils';

// Writing and sharing imply reading
type Access = { read?: boolean; write?: boolean; share?: boolean };
type Right = keyof Access;
const RIGHTS: Right[] = ['read', 'write', 'share'];

const toAccess = (accessModes: string[], delegationAllowed?: boolean): Access => ({
  read: accessModes.length > 0,
  write: accessModes.includes('acl:Write'),
  share: !!delegationAllowed && accessModes.length > 0
});

const toggleRight = (access: Access = {}, right: Right): Access => {
  const value = !access[right];
  if (right === 'read' && !value) return {};
  return { ...access, [right]: value, read: true };
};

const sameAccess = (a: Access = {}, b: Access = {}) => RIGHTS.every(right => !!a[right] === !!b[right]);

// The authorizations are managed by the server of the data owner, which may be another one (e.g. a remote group).
// The data provider reaches it through the proxy of the user's Pod.
const getAuthorizationsEndpoint = (ownerUri?: string | null) => {
  const serverUrl = !ownerUri || ownerUri.startsWith(CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL : new URL(ownerUri).origin;
  return urlJoin(serverUrl, '.auth-agent/authorizations');
};

export const PUBLIC_GRANTEES = [
  { uri: 'http://xmlns.com/foaf/0.1/Agent', curie: 'foaf:Agent', key: 'everyone', icon: <PublicIcon /> },
  {
    uri: 'http://www.w3.org/ns/auth/acl#AuthenticatedAgent',
    curie: 'acl:AuthenticatedAgent',
    key: 'authenticated',
    icon: <VerifiedUserIcon />
  }
];

// The grantee may be compacted when read from the authorization
export const getPublicGrantee = (grantee: string) =>
  PUBLIC_GRANTEES.find(({ uri, curie }) => grantee === uri || grantee === curie);

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
  <Avatar src={grantee.image} sx={{ width: 32, height: 32 }}>
    {grantee.isRole ? <GroupsIcon /> : grantee.label?.toUpperCase()?.[0]}
  </Avatar>
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
  const notify = useNotify();
  const [locale] = useLocaleState();
  const fetchShapeTree = useFetchShapeTree();
  const [shapeTree, setShapeTree] = useState<any>();
  const [dataRegistrationUri, setDataRegistrationUri] = useState<string>();
  const [authorizations, setAuthorizations] = useState<any>();
  const [initialAccess, setInitialAccess] = useState<Record<string, Access>>({});
  const [access, setAccess] = useState<Record<string, Access>>({});
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
    const authorizationsUrl = new URL(getAuthorizationsEndpoint(resourceUri || podOwner));
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
          ...json.authorizations.map((auth: any) => [
            auth.grantee,
            toAccess(arrayOf(auth.accessModes), auth.delegationAllowed)
          ]),
          // The admins have full access to all the data of the group, which can't be changed
          ...(json.roles || [])
            .filter((role: any) => role.isAdmin)
            .map((role: any) => [role.uri, { read: true, write: true, share: true }])
        ]);
        setAuthorizations(json);
        setInitialAccess(currentAccess);
        setAccess(currentAccess);
      })
      // For example, a member of a group without the right to manage its access
      .catch((e: any) => notify(e.body?.message || e.message, { type: 'error' }));
  }, [resourceUri, shapeTreeUri, podOwner, dataProvider, notify]);

  const onShare = useCallback(async () => {
    const changed = Object.keys(access).filter(grantee => !sameAccess(access[grantee], initialAccess[grantee]));
    if (changed.length > 0) {
      await dataProvider.fetch(getAuthorizationsEndpoint(resourceUri || podOwner), {
        method: 'PUT',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...(resourceUri ? { resourceUri } : { shapeTreeUri, podOwner }),
          authorizations: changed.map(grantee => ({
            grantee,
            accessModes: access[grantee]?.read ? ['acl:Read', ...(access[grantee].write ? ['acl:Write'] : [])] : [],
            delegationAllowed: !!access[grantee]?.share
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

// The rights of a grantee, changed through a menu
const AccessMenu = ({
  access,
  rights,
  onChange
}: {
  access?: Access;
  rights: Right[];
  onChange: (access: Access) => void;
}) => {
  const translate = useTranslate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton aria-label={translate('app.share.edit')} onClick={e => setAnchor(e.currentTarget)} edge="end">
        <EditIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {rights.map(right => (
          <MenuItem key={right} onClick={() => onChange(toggleRight(access, right))} sx={{ minHeight: 44 }}>
            <ListItemIcon>{access?.[right] && <CheckIcon fontSize="small" />}</ListItemIcon>
            {translate(`app.share.${right}`)}
          </MenuItem>
        ))}
        {access?.read && <Divider />}
        {access?.read && (
          <MenuItem
            onClick={() => {
              onChange({});
              setAnchor(null);
            }}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon />
            {translate('app.authorization.remove')}
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

const ShareFormContent = ({ form }: { form: ReturnType<typeof useShareForm> }) => {
  const translate = useTranslate();
  const { authorizations, grantees, access, setAccess, isGroup } = form;

  if (!authorizations) return null;

  // A member allowed to share the data cannot give more than their own rights, nor make it public
  const delegateModes: string[] | undefined = authorizations.delegateModes;
  const rights = RIGHTS.filter(right => right !== 'write' || !delegateModes || delegateModes.includes('acl:Write'));
  const summary = (granteeAccess?: Access) =>
    granteeAccess?.read
      ? RIGHTS.filter(right => granteeAccess[right])
          .map(right => translate(`app.share.${right}`))
          .join(', ')
      : translate('app.authorization.none');
  const setGranteeAccess = (uri: string) => (granteeAccess: Access) =>
    setAccess(cur => ({ ...cur, [uri]: granteeAccess }));

  const withAccess = grantees.filter(grantee => access[grantee.uri]?.read);
  const options = grantees.filter(grantee => !withAccess.includes(grantee));
  const rowSx = { px: 0, py: 0.5, minHeight: 56, '& .MuiListItemSecondaryAction-root': { right: 8 } };

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
          if (grantee) setAccess(cur => ({ ...cur, [grantee.uri]: { read: true } }));
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
      />
      <List sx={{ width: '100%' }}>
        {!delegateModes &&
          PUBLIC_GRANTEES.map(({ uri, key, icon }) => (
            <ListItem
              key={uri}
              sx={rowSx}
              secondaryAction={
                <AccessMenu
                  access={access[uri]}
                  rights={rights.filter(right => right !== 'share')}
                  onChange={setGranteeAccess(uri)}
                />
              }
            >
              <ListItemAvatar>
                <Avatar sx={{ width: 32, height: 32 }}>{icon}</Avatar>
              </ListItemAvatar>
              <ListItemText primary={translate(`app.share.${key}`)} secondary={summary(access[uri])} sx={{ pr: 5 }} />
            </ListItem>
          ))}
        {withAccess.map(grantee => (
          <ListItem
            key={grantee.uri}
            sx={rowSx}
            secondaryAction={
              // The access of the admins cannot be changed
              !grantee.isAdmin && (
                <AccessMenu access={access[grantee.uri]} rights={rights} onChange={setGranteeAccess(grantee.uri)} />
              )
            }
          >
            <ListItemAvatar>
              <GranteeAvatar grantee={grantee} />
            </ListItemAvatar>
            <ListItemText
              primary={grantee.label}
              secondary={[grantee.secondary, summary(access[grantee.uri])].filter(Boolean).join(' · ')}
              sx={{ pr: 5 }}
            />
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
    <SimpleBox title={translate('app.page.share')} icon={<ShareIcon />} text={form.text} maxWidth={650}>
      <Header title="app.titles.share" />
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
        <ShareFormContent form={form} />
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
