import React, { useState, useCallback, useEffect } from 'react';
import { useShowContext, useGetIdentity, useNotify, useRefresh, Button } from 'react-admin';
import { useCollection, useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';

const JoinButton = props => {
  const [disabled, setDisabled] = useState(false);
  const [joined, setJoined] = useState(false);
  const outbox = useOutbox();
  const { record } = useShowContext();
  const { data: identity } = useGetIdentity();
  const { items: attendees } = useCollection(record?.['apods:attendees']);
  const notify = useNotify();
  const refresh = useRefresh();

  const join = useCallback(async () => {
    setDisabled(true);
    try {
      await outbox.post({
        type: ACTIVITY_TYPES.JOIN,
        actor: outbox.owner,
        object: record.id,
        to: record['dc:creator']
      });
      notify('You have joined this event');
      setJoined(true);
      setTimeout(refresh, 3000);
    } catch (e) {
      notify(e.message, 'error');
    }
    setDisabled(false);
  }, [setDisabled, record, notify, refresh, outbox]);

  const leave = useCallback(async () => {
    setDisabled(true);
    try {
      await outbox.post({
        type: ACTIVITY_TYPES.LEAVE,
        actor: outbox.owner,
        object: record.id,
        to: record['dc:creator']
      });
      notify('You have left this event');
      setJoined(false);
      setTimeout(refresh, 3000);
    } catch (e) {
      notify(e.message, 'error');
    }
    setDisabled(false);
  }, [setDisabled, setJoined, record, notify, refresh, outbox]);

  useEffect(() => {
    if (attendees) {
      setJoined(attendees.includes(identity?.id));
    }
  }, [attendees, setJoined, identity]);

  if (!record) return null;

  return joined ? (
    <Button onClick={leave} disabled={disabled} startIcon={<LogoutIcon />} label="Leave" {...props} />
  ) : (
    <Button onClick={join} disabled={disabled} startIcon={<LoginIcon />} label="Join" {...props} />
  );
};

export default JoinButton;
