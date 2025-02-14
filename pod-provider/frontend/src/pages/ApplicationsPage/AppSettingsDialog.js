import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslate, Button, useNotify, useRefresh } from 'react-admin';
import { Dialog, DialogTitle, DialogActions, DialogContent, IconButton, Alert } from '@mui/material';
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
  const refresh = useRefresh();

  const {
    requiredAccessNeeds,
    optionalAccessNeeds,
    loaded: accessNeedsLoaded,
    error: accessNeedsError
  } = useAccessNeeds(application);
  const { grants, loaded: grantsLoaded } = useGrants(application.id);
  const { classDescriptions } = useClassDescriptions(application);
  const { data: typeRegistrations } = useTypeRegistrations();
  const removeApp = useRemoveApp();
  const upgradeApp = useUpgradeApp();

  useEffect(() => {
    if (grantsLoaded && accessNeedsLoaded) {
      const requiredAccessNeedsUris = requiredAccessNeeds.map(a => (typeof a === 'string' ? a : a?.id));
      const optionalAccessNeedsUris = optionalAccessNeeds.map(a => (typeof a === 'string' ? a : a?.id));
      const grantedAccessNeedsUris = grants.map(a => (typeof a === 'string' ? a : a?.['interop:satisfiesAccessNeed']));

      // Filter out from the list of granted access needs the ones that are not existing anymore
      const grantedExistingAccessNeedsUris = grantedAccessNeedsUris.filter(
        uri => requiredAccessNeedsUris.includes(uri) || optionalAccessNeedsUris.includes(uri)
      );
      setOldAccessNeedsUris(grantedExistingAccessNeedsUris);

      // If there are new required access needs (in the remote app), automatically select them
      // This will display the "Upgrade" button so that the user can upgrade the app from here
      setNewAccessNeedsUris([...new Set([...grantedExistingAccessNeedsUris, ...requiredAccessNeedsUris])]);
    }
  }, [
    grantsLoaded,
    accessNeedsLoaded,
    grants,
    setOldAccessNeedsUris,
    requiredAccessNeeds,
    optionalAccessNeeds,
    setNewAccessNeedsUris
  ]);

  const onRemove = useCallback(() => {
    try {
      notify('app.notification.app_removal_in_progress');
      setIsPending(true);
      // This will redirect to the app logout and then back to the applications page
      removeApp({ application });
    } catch (e) {
      setIsPending(false);
      notify(`Error on app removal: ${e.message}`, { type: 'error' });
      console.error(e);
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
      refresh();
      onClose();
    } catch (e) {
      setIsPending(false);
      notify(`Error on app upgrade: ${e.message}`, { type: 'error' });
      console.error(e);
    }
  }, [upgradeApp, newAccessNeedsUris, setIsPending, onClose, notify, refresh]);

  // Will be true if there is a difference between the old and the new access needs
  const showUpgradeButton = useMemo(() => {
    return !arraysEqual(oldAccessNeedsUris, newAccessNeedsUris);
  }, [oldAccessNeedsUris, newAccessNeedsUris]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
        {translate('app.dialog.app_permissions')}
        <IconButton 
          sx={{ ml: 'auto' }} 
          onClick={onClose}
          aria-label={translate('ra.action.close')}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 0 }}>
        {accessNeedsError ? (
          <Alert severity="warning">{translate('app.helper.cannot_show_permissions_of_offline_app')}</Alert>
        ) : (
          <>
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
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          variant="contained"
          color="error"
          label="app.action.revoke_access"
          aria-label={translate('app.action.revoke_access')}
          startIcon={<BlockIcon />}
          onClick={onRemove}
          disabled={isPending}
        />
        {showUpgradeButton && (
          <Button
            variant="contained"
            label="app.action.upgrade"
            aria-label={translate('app.action.upgrade')}
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
