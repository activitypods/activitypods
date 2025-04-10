import React, { useState, useCallback } from 'react';
import { useNotify, useTranslate, useRecordContext } from 'react-admin';
import { Button } from '@mui/material';
import { useCollection, useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';

const RemoveContactButton = ({ refetch, ...rest }) => {
  const [disabled, setDisabled] = useState(false);
  const outbox = useOutbox();
  const notify = useNotify();
  const translate = useTranslate();
  const record = useRecordContext();
  const { url } = useCollection('apods:contacts');

  const remove = useCallback(async () => {
    setDisabled(true);
    try {
      await outbox.post({
        type: ACTIVITY_TYPES.REMOVE,
        actor: outbox.owner,
        object: record.id,
        origin: url
      });
      setTimeout(() => {
        refetch();
        notify('app.notification.contact_removed');
        setDisabled(false);
      }, 3000);
    } catch (e) {
      notify(e.message, { type: 'error' });
      setDisabled(false);
    }
  }, [setDisabled, record, notify, refetch, outbox, url]);

  if (!record) return null;

  return (
    <Button onClick={remove} disabled={disabled} {...rest}>
      {translate('app.action.remove_contact')}
    </Button>
  );
};

export default RemoveContactButton;
