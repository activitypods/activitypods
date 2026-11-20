import React from 'react';
import { useTranslate, useNotify } from 'react-admin';
import { Card, Box, Typography, List, ListItem, ListItemAvatar, ListItemText, Avatar, Button } from '@mui/material';
import useActor from '../../hooks/useActor';
import { formatUsername } from '../../utils';
import { GroupMember } from '../../hooks/useGroupMembers';

type Props = {
  requests: GroupMember[];
  onAccept: (memberUri: string) => Promise<void>;
  onReject: (memberUri: string) => Promise<void>;
};

const JoinRequest = ({ request, onAccept, onReject }: { request: GroupMember } & Omit<Props, 'requests'>) => {
  const translate = useTranslate();
  const notify = useNotify();
  const actor = useActor(request.webId);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (e: any) {
      notify(e.message, { type: 'error' });
    }
  };

  return (
    <ListItem
      alignItems="flex-start"
      secondaryAction={
        <Box>
          <Button variant="contained" color="primary" size="small" onClick={() => run(() => onAccept(request.webId))}>
            {translate('app.action.accept')}
          </Button>
          <Button
            variant="contained"
            color="secondary"
            size="small"
            sx={{ ml: 1 }}
            onClick={() => run(() => onReject(request.webId))}
          >
            {translate('app.action.reject')}
          </Button>
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
            <Typography variant="body2" component="span" color="text.secondary" sx={{ ml: 1 }}>
              {formatUsername(request.webId)}
            </Typography>
          </>
        }
        secondary={request.content}
        slotProps={{ secondary: { color: 'text.primary' } }}
      />
    </ListItem>
  );
};

const JoinRequestsBlock = ({ requests, onAccept, onReject }: Props) => {
  const translate = useTranslate();
  if (requests.length === 0) return null;

  return (
    <Card sx={{ mt: 2, mb: 1 }}>
      <Box p={1.5} sx={{ borderBottom: '1px lightgrey solid' }}>
        <Typography variant="body2">{translate('app.block.join_requests')}</Typography>
      </Box>
      <List dense>
        {requests.map(request => (
          <JoinRequest key={request.webId} request={request} onAccept={onAccept} onReject={onReject} />
        ))}
      </List>
    </Card>
  );
};

export default JoinRequestsBlock;
