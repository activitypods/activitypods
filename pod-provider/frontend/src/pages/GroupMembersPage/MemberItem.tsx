import React, { useState } from 'react';
import { useTranslate, useNotify, Confirm } from 'react-admin';
import { ListItem, ListItemAvatar, ListItemText, Avatar, Chip, IconButton, Tooltip, Box } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import useActor from '../../hooks/useActor';
import { formatUsername } from '../../utils';
import { GroupMember } from '../../hooks/useGroupMembers';

type Props = {
  member: GroupMember;
  onRemove: (memberUri: string) => Promise<void>;
  onToggleOwner: (memberUri: string, isOwner: boolean) => Promise<void>;
};

const MemberItem = ({ member, onRemove, onToggleOwner }: Props) => {
  const translate = useTranslate();
  const notify = useNotify();
  const actor = useActor(member.webId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isOwner = member.roles.includes('owner');

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
          <Tooltip title={translate(isOwner ? 'app.action.remove_owner' : 'app.action.make_owner')}>
            <IconButton
              aria-label={translate(isOwner ? 'app.action.remove_owner' : 'app.action.make_owner')}
              onClick={() => run(() => onToggleOwner(member.webId, isOwner))}
            >
              {isOwner ? <StarIcon /> : <StarBorderIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title={translate('app.action.remove_member')}>
            <IconButton aria-label={translate('app.action.remove_member')} onClick={() => setConfirmOpen(true)}>
              <PersonRemoveIcon />
            </IconButton>
          </Tooltip>
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
            {isOwner && <Chip label={translate('app.role.owner')} size="small" sx={{ ml: 1 }} />}
          </>
        }
        secondary={formatUsername(member.webId)}
      />
      <Confirm
        isOpen={confirmOpen}
        title={translate('app.action.remove_member')}
        content={translate('app.helper.remove_member', { name: actor.name })}
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
