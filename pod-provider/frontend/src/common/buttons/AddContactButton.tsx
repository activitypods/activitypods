import React, { useState, useCallback } from 'react';
import { useNotify, useTranslate, useRecordContext } from 'react-admin';
import { Button } from '@mui/material';
import { useCollection, useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';

const AddContactButton = ({ refetch, ...rest }: any) => {
  const [disabled, setDisabled] = useState(false);
  const outbox = useOutbox();
  const notify = useNotify();
  const translate = useTranslate();
  const record = useRecordContext();
  const { url } = useCollection('apods:contacts');

  const add = useCallback(async () => {
    setDisabled(true);
    try {
      await outbox.post({
        type: ACTIVITY_TYPES.ADD,
        actor: outbox.owner,
        object: record.id,
        origin: url
      });
      setTimeout(() => {
        refetch();
        notify('app.notification.contact_added');
        setDisabled(false);
      }, 3000);
    } catch (e) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      notify(e.message, { type: 'error' });
      setDisabled(false);
    }
  }, [setDisabled, record, notify, refetch, outbox, url]);

  if (!record) return null;

  return (
    <Button onClick={add} disabled={disabled} {...rest}>
      {translate('app.action.add_contact')}
    </Button>
  );
};

export default AddContactButton;
