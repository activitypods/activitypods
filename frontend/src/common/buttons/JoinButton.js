import React, { useState, useCallback, useEffect } from 'react';
import { useShowContext, useGetIdentity, useNotify, useRefresh, useTranslate } from 'react-admin';
import { useCollection, useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';
import { Button } from '@material-ui/core';

const JoinButton = (props) => {
  const [disabled, setDisabled] = useState(false);
  const [joined, setJoined] = useState(false);
  const outbox = useOutbox();
  const { record } = useShowContext();
  const { identity } = useGetIdentity();
  const { items: attendees } = useCollection(record?.['apods:attendees']);
  const notify = useNotify();
  const refresh = useRefresh();
  const translate = useTranslate();

  const join = useCallback(async () => {
    setDisabled(true);
    try {
      await outbox.post({
        type: ACTIVITY_TYPES.JOIN,
        actor: outbox.owner,
        object: record.id,
        to: record['dc:creator'],
      });
      notify('app.notification.event_joined');
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
        to: record['dc:creator'],
      });
      notify('app.notification.event_left');
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

  const isOrganizer = record['dc:creator'] === identity?.id;
  const status = Array.isArray(record['apods:hasStatus']) ? record['apods:hasStatus'] : [record['apods:hasStatus']];
  const isClosed = status.includes('apods:Closed');
  const isFinished = status.includes('apods:Finished');

  return joined ? (
    <Button onClick={leave} disabled={disabled || isOrganizer || isFinished} {...props}>
      {translate('app.action.leave')}
    </Button>
  ) : (
    <Button onClick={join} disabled={disabled || isOrganizer || isClosed || isFinished} {...props}>
      {translate('app.action.join')}
    </Button>
  );
};

export default JoinButton;
