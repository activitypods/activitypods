import React, { useState } from 'react';
import { useTranslate, useLocaleState } from 'react-admin';
import { useQueryClient } from '@tanstack/react-query';
import { Card, Box, Button, List, ListItem, ListItemAvatar, ListItemText, Avatar, Typography } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import ShareIcon from '@mui/icons-material/Share';
import useActor from '../../hooks/useActor';
import useRoleLabel from '../../hooks/useRoleLabel';
import useGroupMembers, { GroupRole } from '../../hooks/useGroupMembers';
import usePodAuthorizations from '../../hooks/usePodAuthorizations';
import useRealmContext from '../../hooks/useRealmContext';
import { ShareDialog } from '../AuthorizePage/ShareScreen';
import { arrayOf, withoutOwnerRole } from '../../utils';

const GranteeItem = ({ authorization, roles, via }: { authorization: any; roles?: GroupRole[]; via?: string }) => {
  const translate = useTranslate();
  const roleLabel = useRoleLabel();
  const grantee = authorization['interop:grantee'];
  const role = roles?.find(r => r.uri === grantee);
  const actor = useActor(role ? undefined : grantee, { loadPrivateProfile: false });
  const access = arrayOf(authorization['interop:accessMode']).includes('acl:Write') ? 'read_write' : 'read';

  return (
    <ListItem sx={{ px: 0, opacity: via ? 0.6 : 1 }}>
      <ListItemAvatar>
        <Avatar src={role ? undefined : actor.image}>
          {role ? <GroupsIcon /> : (actor.name || grantee).toUpperCase()[0]}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={role ? roleLabel(role) : actor.name || grantee}
        secondary={
          via ? `${translate(`app.authorization.${access}`)} (${via})` : translate(`app.authorization.${access}`)
        }
      />
    </ListItem>
  );
};

// Who has access to a resource, or to all the data of a container, with a button to change it
const AccessCard = ({ container, resourceUri }: { container: any; resourceUri?: string }) => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const queryClient = useQueryClient();
  const { data: pod } = useRealmContext() as any;
  const { roles } = useGroupMembers();
  const hiddenRolesUris = (roles || [])
    .filter(role => !withoutOwnerRole(roles || []).includes(role))
    .map(role => role.uri);
  const authorizations = (usePodAuthorizations() || []).filter(
    (a: any) => !hiddenRolesUris.includes(a['interop:grantee'])
  );
  const [open, setOpen] = useState(false);

  if (!container) return null;

  const typeName = container.label?.[locale] || container.label?.en;
  const typeAuthorizations = authorizations.filter(
    (a: any) =>
      a['interop:hasDataRegistration'] === container.uri && a['interop:scopeOfAuthorization'] === 'interop:All'
  );
  const resourceAuthorizations = resourceUri
    ? authorizations.filter(
        (a: any) =>
          a['interop:scopeOfAuthorization'] === 'interop:SelectedFromRegistry' &&
          arrayOf(a['interop:hasDataInstance']).includes(resourceUri)
      )
    : [];
  const items = resourceUri ? resourceAuthorizations : typeAuthorizations;
  const inherited = resourceUri ? typeAuthorizations : [];

  return (
    // Below the ResourceCard when a resource is shown
    <Card sx={{ mt: resourceUri ? 3 : '5px', mb: 3 }}>
      <Box p={2} sx={{ backgroundColor: 'primary.main', color: 'primary.contrastText' }}>
        <Typography variant="h6">
          {resourceUri ? translate('app.helper.resource_access') : translate('app.helper.type_access')}
        </Typography>
      </Box>
      <Box p={2}>
        {items.length + inherited.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {translate('app.helper.no_access')}
          </Typography>
        )}
        <List dense>
          {items.map((authorization: any) => (
            <GranteeItem key={authorization.id || authorization['@id']} authorization={authorization} roles={roles} />
          ))}
          {inherited.map((authorization: any) => (
            <GranteeItem
              key={authorization.id || authorization['@id']}
              authorization={authorization}
              roles={roles}
              via={translate('app.helper.via_type', { typeName })}
            />
          ))}
        </List>
        <Box display="flex" justifyContent="end">
          <Button variant="contained" color="secondary" startIcon={<ShareIcon />} onClick={() => setOpen(true)}>
            {translate('app.action.manage_access')}
          </Button>
        </Box>
      </Box>
      <ShareDialog
        open={open}
        resourceUri={resourceUri}
        shapeTreeUri={resourceUri ? undefined : container.shapeTreeUri}
        podOwner={pod?.id}
        onClose={() => {
          setOpen(false);
          queryClient.invalidateQueries({ queryKey: ['podAuthorizations'] });
        }}
      />
    </Card>
  );
};

export default AccessCard;
