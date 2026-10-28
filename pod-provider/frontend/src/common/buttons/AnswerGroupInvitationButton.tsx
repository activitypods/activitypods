import React, { useCallback } from 'react';
import { useNotify, useTranslate } from 'react-admin';
import { Button } from '@mui/material';
import { useOutbox, ACTIVITY_TYPES } from '@semapps/activitypub-components';

type Props = {
  activity: any;
  accept: boolean;
  refetch: () => void;
  [key: string]: any;
};

const AnswerGroupInvitationButton = ({ activity, accept, refetch, children, ...rest }: Props) => {
  const outbox = useOutbox();
  const notify = useNotify();
  const translate = useTranslate();

  const answer = useCallback(async () => {
    try {
      await outbox.post({
        type: accept ? ACTIVITY_TYPES.ACCEPT : ACTIVITY_TYPES.REJECT,
        actor: outbox.owner,
        object: activity.id,
        to: activity.actor
      });
      notify(accept ? 'app.notification.group_invitation_accepted' : 'app.notification.group_invitation_rejected');
      setTimeout(refetch, 3000);
    } catch (e: any) {
      notify(e.message, { type: 'error' });
    }
  }, [outbox, notify, refetch, activity, accept]);

  return (
    <Button onClick={answer} {...rest}>
      {children || translate(accept ? 'app.action.accept_group_invitation' : 'app.action.reject_group_invitation')}
    </Button>
  );
};

export default AnswerGroupInvitationButton;
