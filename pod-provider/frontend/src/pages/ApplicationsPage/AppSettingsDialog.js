import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslate, Button, useNotify } from 'react-admin';
import { Dialog, DialogTitle, DialogActions, DialogContent, IconButton } from '@mui/material';
import useAccessNeeds from '../../hooks/useAccessNeeds';
import useClassDescriptions from '../../hooks/useClassDescriptions';
import AccessNeedsList from '../../common/list/AccessNeedsList';
import useTypeRegistrations from '../../hooks/useTypeRegistrations';
import CloseIcon from '@mui/icons-material/Close';
import BlockIcon from '@mui/icons-material/Block';
import LoopIcon from '@mui/icons-material/Loop';
import useUpgradeApp from '../../hooks/useUpgradeApp';
import useRemoveApp from '../../hooks/useRemoveApp';
import { arraysEqual } from '../../utils';

const AppSettingsDialog = ({ application, open, onClose }) => {
  const [oldAccessNeedsUris, setOldAccessNeedsUris] = useState();
  const [newAccessNeedsUris, setNewAccessNeedsUris] = useState();
  const translate = useTranslate();
  const notify = useNotify();

  const { requiredAccessNeeds, optionalAccessNeeds, loaded } = useAccessNeeds(application);
  const { classDescriptions } = useClassDescriptions(application);
  const { data: typeRegistrations } = useTypeRegistrations();
  const removeApp = useRemoveApp();
  const upgradeApp = useUpgradeApp();

  useEffect(() => {
    if (loaded) {
      const accessNeedsUris = [
        ...requiredAccessNeeds.map(a => (typeof a === 'string' ? a : a?.id)),
        ...optionalAccessNeeds.map(a => (typeof a === 'string' ? a : a?.id))
      ];
      setOldAccessNeedsUris(accessNeedsUris);
      setNewAccessNeedsUris(accessNeedsUris);
    }
  }, [loaded, requiredAccessNeeds, optionalAccessNeeds, setOldAccessNeedsUris, setNewAccessNeedsUris]);

  const onRemove = useCallback(() => {
    removeApp({ appUri: application.id });
  }, [removeApp, application]);

  const onUpgrade = useCallback(async () => {
    try {
      await upgradeApp({
        appUri: application.id,
        grantedAccessNeeds: newAccessNeedsUris
      });

      notify(`app.notification.app_upgraded`, { type: 'success' });
    } catch (e) {
      notify(`Error on app upgrade: ${e.message}`, { type: 'error' });
    }
  }, [upgradeApp, newAccessNeedsUris]);

  // Will be true if there is a difference between the old and the new access needs
  const showUpgradeButton = useMemo(() => {
    return !arraysEqual(oldAccessNeedsUris, newAccessNeedsUris);
  }, [oldAccessNeedsUris, newAccessNeedsUris]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
        {translate('app.dialog.app_permissions')}
        <IconButton sx={{ ml: 'auto' }} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 0 }}>
        <AccessNeedsList
          required
          accessNeeds={requiredAccessNeeds}
          allowedAccessNeeds={newAccessNeedsUris}
          setAllowedAccessNeeds={setNewAccessNeedsUris}
          classDescriptions={classDescriptions}
          typeRegistrations={typeRegistrations}
        />
        <AccessNeedsList
          accessNeeds={optionalAccessNeeds}
          allowedAccessNeeds={newAccessNeedsUris}
          setAllowedAccessNeeds={setNewAccessNeedsUris}
          classDescriptions={classDescriptions}
          typeRegistrations={typeRegistrations}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          variant="contained"
          color="error"
          label="app.action.revoke_access"
          startIcon={<BlockIcon />}
          onClick={onRemove}
        />
        {showUpgradeButton && (
          <Button variant="contained" label="app.action.upgrade" startIcon={<LoopIcon />} onClick={onUpgrade} />
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AppSettingsDialog;
