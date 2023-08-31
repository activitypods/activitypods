import React, { useCallback } from 'react';
import { useNotify, useTranslate } from 'react-admin';
import { Button } from '@mui/material';
import { useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';

const IgnoreContactRequestButton = ({ activity, refetch, children, ...rest }) => {
  const outbox = useOutbox();
  const notify = useNotify();
  const translate = useTranslate();

  const ignore = useCallback(
    async () => {
      try {
        await outbox.post({
          type: ACTIVITY_TYPES.IGNORE,
          actor: outbox.owner,
          object: activity.id,
          to: activity.actor,
        });
        notify('app.notification.contact_request_ignored');
        setTimeout(refetch, 3000);
      } catch (e) {
        notify(e.message, 'error');
      }
    },
    [outbox, refetch, notify, activity]
  );

  if (!activity) return null;

  return(
    <Button onClick={ignore} {...rest}>
      {children || translate('app.action.ignore_contact_request')}
    </Button>
  );
};

export default IgnoreContactRequestButton;
