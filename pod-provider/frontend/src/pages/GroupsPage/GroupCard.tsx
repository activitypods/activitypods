import React, { useEffect, useState } from 'react';
import urlJoin from 'url-join';
import { useTranslate, useNotify, useDataProvider, useGetIdentity, Confirm } from 'react-admin';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  Typography,
  Avatar,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  useMediaQuery
} from '@mui/material';
import GroupIcon from '@mui/icons-material/PeopleAlt';
import { useOutbox, useCollection, ACTIVITY_TYPES } from '@semapps/activitypub-components';
import { getGroupEndpoint } from '../../hooks/useGroupRights';
import ActionsBlock from '../../common/blocks/ActionsBlock';
import AnswerGroupInvitationButton from '../../common/buttons/AnswerGroupInvitationButton';
import { Group } from '../../hooks/useGroups';

const GroupCard = ({ group, refetch }: { group: Group; refetch: () => void }) => {
  const translate = useTranslate();
  const xs = useMediaQuery((theme: any) => theme.breakpoints.down('sm'), { noSsr: true });
  const notify = useNotify();
  const navigate = useNavigate();
  const dataProvider = useDataProvider();
  const outbox = useOutbox();
  const { data: identity } = useGetIdentity();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isLastOwner, setIsLastOwner] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joinMessage, setJoinMessage] = useState('');
  const { items: invitations, refetch: refetchInvitations } = useCollection('apods:groupInvitations');
  const invitation = invitations?.find((activity: any) => activity.actor === group.id);

  const isOwner = group.rights.roles.some(role => role.id === 'owner');
  const canManage = group.rights.specialRights.length > 0;

  useEffect(() => {
    if (isOwner && group.rights.specialRights.includes('interop:ReadMembers')) {
      dataProvider
        .fetch(urlJoin(getGroupEndpoint(group.webIdData)!, 'members'))
        .then(({ json }: any) =>
          setIsLastOwner(json.filter((member: any) => member.roles.includes('owner')).length === 1)
        );
    }
  }, [dataProvider, group, isOwner]);

  const leave = async () => {
    setConfirmOpen(false);
    try {
      await outbox.post({
        type: ACTIVITY_TYPES.LEAVE,
        actor: identity?.id,
        object: group.id,
        to: group.id
      });
      notify('app.notification.group_left', { type: 'success', messageArgs: { name: group.name } });
      navigate('/network/groups');
    } catch (e: any) {
      notify(e.message, { type: 'error' });
    }
  };

  const post = async (activity: object, notification: string) => {
    try {
      await outbox.post({ actor: identity?.id, to: group.id, ...activity });
      notify(notification, { type: 'success', messageArgs: { name: group.name } });
      setTimeout(refetch, 3000);
    } catch (e: any) {
      notify(e.message, { type: 'error' });
    }
  };

  const join = async () => {
    setJoinDialogOpen(false);
    await post(
      { type: ACTIVITY_TYPES.JOIN, object: group.id, content: joinMessage.trim() || undefined },
      group.joinPolicy === 'apods:OpenJoin' ? 'app.notification.group_joined' : 'app.notification.join_request_sent'
    );
  };

  const onAnswered = () => {
    refetchInvitations();
    refetch();
  };

  const invitationActions = invitation && (
    <>
      <AnswerGroupInvitationButton
        activity={invitation}
        accept
        refetch={onAnswered}
        variant="contained"
        color="secondary"
        fullWidth
        sx={{ mb: 1 }}
      />
      <AnswerGroupInvitationButton
        activity={invitation}
        accept={false}
        refetch={onAnswered}
        variant="contained"
        color="secondary"
        fullWidth
      />
    </>
  );

  const memberActions = group.isMember && (
    <>
      {canManage && (
        <Button
          component={Link}
          to={`/group/${group.webfingerId}/members`}
          variant="contained"
          color="secondary"
          fullWidth
          sx={{ mb: 1 }}
        >
          {translate('app.action.manage_group')}
        </Button>
      )}
      <Button
        variant="contained"
        color="secondary"
        fullWidth
        disabled={isLastOwner}
        onClick={() => setConfirmOpen(true)}
      >
        {translate('app.action.leave_group')}
      </Button>
      {isLastOwner && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {translate('app.helper.last_owner_cannot_leave')}
        </Typography>
      )}
      <Confirm
        isOpen={confirmOpen}
        title={translate('app.action.leave_group')}
        content={translate('app.helper.leave_group', { name: group.name })}
        onConfirm={leave}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );

  let joinActions;
  if (group.rights.joinRequest) {
    joinActions = (
      <>
        <Button variant="contained" fullWidth disabled sx={{ mb: 1 }}>
          {translate('app.action.join_request_sent')}
        </Button>
        <Button
          variant="contained"
          color="secondary"
          fullWidth
          onClick={() =>
            post(
              { type: ACTIVITY_TYPES.UNDO, object: group.rights.joinRequest },
              'app.notification.join_request_cancelled'
            )
          }
        >
          {translate('app.action.cancel_join_request')}
        </Button>
      </>
    );
  } else if (group.joinPolicy === 'apods:OpenJoin') {
    joinActions = (
      <Button variant="contained" color="secondary" fullWidth onClick={join}>
        {translate('app.action.join_group')}
      </Button>
    );
  } else if (group.joinPolicy === 'apods:ModeratedJoin') {
    joinActions = (
      <>
        <Button variant="contained" color="secondary" fullWidth onClick={() => setJoinDialogOpen(true)}>
          {translate('app.action.request_to_join')}
        </Button>
        <Dialog open={joinDialogOpen} onClose={() => setJoinDialogOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>{translate('app.action.request_to_join')}</DialogTitle>
          <DialogContent>
            <TextField
              label={translate('app.input.join_message')}
              value={joinMessage}
              onChange={e => setJoinMessage(e.target.value)}
              multiline
              minRows={3}
              fullWidth
              margin="dense"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setJoinDialogOpen(false)}>{translate('ra.action.cancel')}</Button>
            <Button variant="contained" color="secondary" onClick={join}>
              {translate('app.action.send')}
            </Button>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  const actions = memberActions || invitationActions || joinActions;

  if (xs) return actions ? <ActionsBlock>{actions}</ActionsBlock> : null;

  return (
    <Card sx={{ mt: '5px', mb: 3 }}>
      <Box
        sx={{
          height: 85,
          position: 'relative',
          backgroundImage: theme =>
            `radial-gradient(circle at 50% 14em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`
        }}
      >
        <Box display="flex" justifyContent="center" sx={{ position: 'absolute', top: 10, left: 0, right: 0 }}>
          <Avatar src={group.avatar} sx={{ width: 150, height: 150 }}>
            <GroupIcon sx={{ fontSize: 80 }} />
          </Avatar>
        </Box>
      </Box>
      <Box sx={{ backgroundColor: 'white', pt: 10, pb: 2.5 }}>
        <Typography variant="h2" align="center">
          {group.name}
        </Typography>
        <Typography align="center">{group.webfingerId}</Typography>
      </Box>
      <Box sx={{ backgroundColor: 'white', textAlign: 'center', px: 3, pb: 3 }}>{actions}</Box>
    </Card>
  );
};

export default GroupCard;
