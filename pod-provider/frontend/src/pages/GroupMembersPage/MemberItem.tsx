import React, { useState } from 'react';
import { useTranslate, useNotify, Confirm } from 'react-admin';
import {
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemIcon,
  Avatar,
  Chip,
  IconButton,
  Tooltip,
  Box,
  Menu,
  MenuItem,
  Checkbox
} from '@mui/material';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import CancelScheduleSendIcon from '@mui/icons-material/CancelScheduleSend';
import useActor from '../../hooks/useActor';
import useRoleLabel from '../../hooks/useRoleLabel';
import { formatUsername } from '../../utils';
import { GroupMember, GroupRole, getInheritedRoles } from '../../hooks/useGroupMembers';

type Props = {
  member: GroupMember;
  roles: GroupRole[];
  isOwner: boolean;
  rights: string[];
  onRemove: (memberUri: string) => Promise<void>;
  onToggleRole: (role: string, memberUri: string, hasRole: boolean) => Promise<void>;
};

const MemberItem = ({ member, roles, isOwner, rights, onRemove, onToggleRole }: Props) => {
  const translate = useTranslate();
  const notify = useNotify();
  const actor = useActor(member.webId);
  const roleLabel = useRoleLabel();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const inheritedRoles = getInheritedRoles(member.roles, roles);
  const assignableRoles = roles.filter(role => !role.isDefaultRole);
  const shownRoles = assignableRoles.filter(
    role => member.roles.includes(role.id) && !inheritedRoles.includes(role.id)
  );
  const memberIsOwner = member.roles.includes('owner');
  const canRemove = rights.includes('interop:ManageMembers') && (isOwner || !memberIsOwner);
  const removeLabel = translate(member.invited ? 'app.action.cancel_invitation' : 'app.action.remove_member');

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (e: any) {
      notify(e.message, { type: 'error' });
    }
  };

  return (
    <ListItem
      sx={{ backgroundColor: 'white', mb: 1, boxShadow: 1 }}
      secondaryAction={
        <Box>
          {!member.invited && rights.includes('interop:ManageRoles') && (
            <Tooltip title={translate('app.action.manage_roles')}>
              <IconButton
                aria-label={translate('app.action.manage_roles')}
                onClick={event => setMenuAnchor(event.currentTarget)}
              >
                <ManageAccountsIcon />
              </IconButton>
            </Tooltip>
          )}
          {canRemove && (
            <Tooltip title={removeLabel}>
              <IconButton aria-label={removeLabel} onClick={() => setConfirmOpen(true)}>
                {member.invited ? <CancelScheduleSendIcon /> : <PersonRemoveIcon />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      }
    >
      <ListItemAvatar>
        <Avatar src={actor.image}>{actor.name?.toUpperCase()?.[0]}</Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={
          <>
            {actor.name}
            {member.invited && (
              <Chip label={translate('app.role.invited')} size="small" variant="outlined" sx={{ ml: 1 }} />
            )}
            {shownRoles.map(role => (
              <Chip key={role.id} label={roleLabel(role)} size="small" sx={{ ml: 1 }} />
            ))}
          </>
        }
        secondary={formatUsername(member.webId)}
      />
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {assignableRoles.map(role => {
          const hasRole = member.roles.includes(role.id);
          const isInherited = inheritedRoles.includes(role.id);
          return (
            <MenuItem
              key={role.id}
              disabled={isInherited || (role.id === 'owner' && !isOwner)}
              onClick={() => {
                setMenuAnchor(null);
                run(() => onToggleRole(role.id, member.webId, hasRole));
              }}
            >
              <ListItemIcon>
                <Checkbox edge="start" checked={hasRole} disableRipple size="small" />
              </ListItemIcon>
              {roleLabel(role)}
            </MenuItem>
          );
        })}
      </Menu>
      <Confirm
        isOpen={confirmOpen}
        title={removeLabel}
        content={translate(member.invited ? 'app.helper.cancel_invitation' : 'app.helper.remove_member', {
          name: actor.name
        })}
        onConfirm={async () => {
          setConfirmOpen(false);
          await run(() => onRemove(member.webId));
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </ListItem>
  );
};

export default MemberItem;
