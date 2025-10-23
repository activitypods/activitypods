import React, { useCallback } from 'react';
import { useNotify, useTranslate } from 'react-admin';
import { Button } from '@mui/material';
import { useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';

const RejectContactRequestButton = ({ activity, refetch, children, ...rest }: any) => {
  const outbox = useOutbox();
  const notify = useNotify();
  const translate = useTranslate();

  const reject = useCallback(async () => {
    try {
      await outbox.post({
        type: ACTIVITY_TYPES.REJECT,
        actor: outbox.owner,
        object: activity.id,
        to: activity.actor
      });
      notify('app.notification.contact_request_rejected');
      setTimeout(refetch, 3000);
    } catch (e) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      notify(e.message, { type: 'error' });
    }
  }, [outbox, refetch, notify, activity]);

  if (!activity) return null;

  return (
    <Button onClick={reject} {...rest}>
      {children || translate('app.action.reject_contact_request')}
    </Button>
  );
};

export default RejectContactRequestButton;
