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
import useGrants from '../../hooks/useGrants';
import useUpgradeApp from '../../hooks/useUpgradeApp';
import useRemoveApp from '../../hooks/useRemoveApp';
import { arraysEqual } from '../../utils';

const AppSettingsDialog = ({ application, open, onClose }) => {
  const [oldAccessNeedsUris, setOldAccessNeedsUris] = useState();
  const [newAccessNeedsUris, setNewAccessNeedsUris] = useState();
  const [isPending, setIsPending] = useState(false);
  const translate = useTranslate();
  const notify = useNotify();

  const { requiredAccessNeeds, optionalAccessNeeds } = useAccessNeeds(application);
  const { grants, loaded: grantsLoaded, refetch: refetchGrants } = useGrants(application.id);
  const { classDescriptions } = useClassDescriptions(application);
  const { data: typeRegistrations } = useTypeRegistrations();
  const removeApp = useRemoveApp();
  const upgradeApp = useUpgradeApp();

  useEffect(() => {
    if (grantsLoaded) {
      setOldAccessNeedsUris(grants.map(a => (typeof a === 'string' ? a : a?.['interop:satisfiesAccessNeed'])));
      setNewAccessNeedsUris(grants.map(a => (typeof a === 'string' ? a : a?.['interop:satisfiesAccessNeed'])));
    }
  }, [grantsLoaded, grants, setOldAccessNeedsUris, setNewAccessNeedsUris]);

  const onRemove = useCallback(() => {
    try {
      notify('app.notification.app_removal_in_progress');
      setIsPending(true);
      // This will redirect to the app logout and then back to the applications page
      removeApp({ application });
    } catch (e) {
      setIsPending(false);
      notify(`Error on app removal: ${e.message}`, { type: 'error' });
    }
  }, [removeApp, application, setIsPending, notify]);

  const onUpgrade = useCallback(async () => {
    try {
      notify(`app.notification.app_upgrade_progress`);
      setIsPending(true);
      await upgradeApp({
        appUri: application.id,
        grantedAccessNeeds: newAccessNeedsUris
      });
      notify(`app.notification.app_upgraded`, { type: 'success' });
      setIsPending(false);
      onClose();
      refetchGrants();
    } catch (e) {
      setIsPending(false);
      notify(`Error on app upgrade: ${e.message}`, { type: 'error' });
    }
  }, [upgradeApp, newAccessNeedsUris, setIsPending, onClose, notify, refetchGrants]);

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
          disabled={isPending}
        />
        {showUpgradeButton && (
          <Button
            variant="contained"
            label="app.action.upgrade"
            startIcon={<LoopIcon />}
            onClick={onUpgrade}
            disabled={isPending}
          />
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AppSettingsDialog;
