import React, { useCallback } from 'react';
import { useNotify, useTranslate } from 'react-admin';
import { Button } from '@mui/material';
import { useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';

const AcceptContactRequestButton = ({ activity, refetch, children, ...rest }) => {
  const outbox = useOutbox();
  const notify = useNotify();
  const translate = useTranslate();

  const accept = useCallback(async () => {
    try {
      await outbox.post({
        type: ACTIVITY_TYPES.ACCEPT,
        actor: outbox.owner,
        object: activity.id,
        to: activity.actor
      });
      notify('app.notification.contact_request_accepted');
      setTimeout(refetch, 3000);
    } catch (e) {
      notify(e.message, { type: 'error' });
    }
  }, [outbox, notify, refetch, activity]);

  if (!activity) return null;

  return (
    <Button onClick={accept} {...rest}>
      {children || translate('app.action.accept_contact_request')}
    </Button>
  );
};

export default AcceptContactRequestButton;
