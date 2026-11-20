import React, { useEffect, useState } from 'react';
import urlJoin from 'url-join';
import { useTranslate, useNotify, useDataProvider } from 'react-admin';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  RadioGroup,
  FormControlLabel,
  Radio
} from '@mui/material';
import { getGroupEndpoint } from '../../hooks/useGroupRights';

export const JOIN_POLICIES = ['interop:OpenJoin', 'interop:ModeratedJoin', 'interop:InviteOnly'];

type Props = {
  open: boolean;
  group: any;
  onClose: () => void;
  onSaved: () => void;
};

const JoinPolicyDialog = ({ open, group, onClose, onSaved }: Props) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const currentPolicy = group.webIdData['interop:joinPolicy'] || 'interop:InviteOnly';
  const [joinPolicy, setJoinPolicy] = useState(currentPolicy);

  useEffect(() => {
    if (open) setJoinPolicy(currentPolicy);
  }, [open, currentPolicy]);

  const save = async () => {
    try {
      await dataProvider.fetch(urlJoin(getGroupEndpoint(group.webIdData)!, 'join-policy'), {
        method: 'PUT',
        body: JSON.stringify({ joinPolicy }),
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
      onClose();
      onSaved();
    } catch (e: any) {
      notify(e.message, { type: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{translate('app.setting.join_policy')}</DialogTitle>
      <DialogContent>
        <RadioGroup value={joinPolicy} onChange={e => setJoinPolicy(e.target.value)}>
          {JOIN_POLICIES.map(policy => (
            <FormControlLabel
              key={policy}
              value={policy}
              control={<Radio />}
              label={translate(`app.join_policy.${policy.split(':')[1]}`)}
            />
          ))}
        </RadioGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{translate('ra.action.cancel')}</Button>
        <Button variant="contained" color="secondary" onClick={save}>
          {translate('ra.action.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default JoinPolicyDialog;
