import React, { useState, useCallback, useMemo } from 'react';
import { useShowContext, useNotify, useTranslate, useRecordContext } from 'react-admin';
import { Button } from '@mui/material';
import { useCollection, useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';

const IgnoreContactButton = ({ ...rest }) => {
  const [disabled, setDisabled] = useState(false);
  const outbox = useOutbox();
  const notify = useNotify();
  const translate = useTranslate();
  const record = useRecordContext();
  const { url, items: ignoredContacts, refetch: refetchIgnored } = useCollection('apods:ignoredContacts');

  const ignore = useCallback(async () => {
    setDisabled(true);
    try {
      await outbox.post({
        type: ACTIVITY_TYPES.IGNORE,
        actor: outbox.owner,
        object: record.id,
        origin: url
      });
      setTimeout(() => {
        refetchIgnored();
        notify('app.notification.contact_ignored');
        setDisabled(false);
      }, 3000);
    } catch (e) {
      notify(e.message, { type: 'error' });
      setDisabled(false);
    }
  }, [setDisabled, record, notify, refetchIgnored, outbox, url]);

  const undoIgnore = useCallback(async () => {
    setDisabled(true);
    try {
      await outbox.post({
        type: ACTIVITY_TYPES.UNDO,
        object: {
          type: ACTIVITY_TYPES.IGNORE,
          actor: outbox.owner,
          object: record.id
        }
      });
      setTimeout(() => {
        refetchIgnored();
        notify('app.notification.contact_ignore_undone');
        setDisabled(false);
      }, 3000);
    } catch (e) {
      notify(e.message, { type: 'error' });
      setDisabled(false);
    }
  }, [setDisabled, record, notify, refetchIgnored, outbox]);

  const isContactIgnored = useMemo(
    () => !!ignoredContacts?.find(ignored => ignored === record?.id),
    [ignoredContacts, record]
  );

  return (
    <Button onClick={isContactIgnored ? undoIgnore : ignore} disabled={disabled} {...rest}>
      {translate(isContactIgnored ? 'app.action.undo_ignore_contact' : 'app.action.ignore_contact')}
    </Button>
  );
};

export default IgnoreContactButton;
