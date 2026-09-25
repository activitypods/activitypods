import React, { useEffect, useState, useCallback } from 'react';
import { useNotify, useTranslate } from 'react-admin';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import SimpleBox from '../../layout/SimpleBox';
import useAccessNeeds from '../../hooks/useAccessNeeds';
import useAccessGrants from '../../hooks/useAccessGrants';
import useAgentRegistration from '../../hooks/useAgentRegistration';
import AccessNeedsList from '../../common/list/AccessNeedsList';
import ProgressMessage from '../../common/ProgressMessage';
import AppHeader from './AppHeader';
import { arrayOf } from '../../utils';
import useRemoveApp from '../../hooks/useRemoveApp';
import useUpgradeApp from '../../hooks/useUpgradeApp';

const UpgradeScreen = ({ application, accessApp, isTrustedApp }: any) => {
  const [step, setStep] = useState();
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
  const [allowedAccessNeeds, setAllowedAccessNeeds] = useState([]);
  const [grantedAccessNeeds, setGrantedAccessNeeds] = useState([]);
  const [missingAccessNeeds, setMissingAccessNeeds] = useState({ required: [], optional: [] });
  const translate = useTranslate();
  const notify = useNotify();
  const removeApp = useRemoveApp();
  const upgradeApp = useUpgradeApp();

  const { requiredAccessNeeds, optionalAccessNeeds, loaded: accessNeedsLoaded } = useAccessNeeds(application);
  const { accessGrants, loaded: accessGrantsLoaded } = useAccessGrants(application.id);
  const { agentRegistration, loaded: agentRegistrationLoaded } = useAgentRegistration(application.id);

  useEffect(() => {
    (async () => {
      if (step === 'upgrade') {
        try {
          // @ts-expect-error TS(2345): Argument of type '"upgrading"' is not assignable t... Remove this comment to see the full error message
          setStep('upgrading');

          await upgradeApp({
            appUri: application.id,
            grantedAccessNeeds: [...grantedAccessNeeds, ...allowedAccessNeeds]
          });

          await accessApp();
        } catch (e) {
          // @ts-expect-error TS(2345): Argument of type '"error"' is not assignable to pa... Remove this comment to see the full error message
          setStep('error');
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          notify(`Error on app upgrade: ${e.message}`, { type: 'error' });
        }
      }
    })();
  }, [application, upgradeApp, allowedAccessNeeds, grantedAccessNeeds, accessApp, step, setStep]);

  useEffect(() => {
    if (accessNeedsLoaded && accessGrantsLoaded && agentRegistrationLoaded && !step) {
      // @ts-expect-error
      setStep('preparation');

      const grantedAccessNeeds = [];
      const missingAccessNeeds = { required: [], optional: [] };

      for (const [necessity, accessNeeds] of Object.entries({
        required: requiredAccessNeeds,
        optional: optionalAccessNeeds
      })) {
        for (const accessNeed of accessNeeds) {
          const matchingGrant =
            typeof accessNeed === 'string'
              ? arrayOf(agentRegistration['apods:hasSpecialRights']).find(specialRight => specialRight === accessNeed)
              : accessGrants.find(
                  g =>
                    typeof g !== 'string' &&
                    g['apods:registeredClass'] === accessNeed['apods:registeredClass'] &&
                    // Every mode in the access need must be in the existing grant.
                    // If the existing grant has more access mode, we will not ask user consent to remove it
                    arrayOf(accessNeed['interop:accessMode']).every(m => arrayOf(g['interop:accessMode']).includes(m))
                );

          if (matchingGrant) {
            // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
            grantedAccessNeeds.push(typeof accessNeed === 'string' ? accessNeed : accessNeed.id);
          } else {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            missingAccessNeeds[necessity].push(accessNeed);
          }
        }
      }

      setMissingAccessNeeds(missingAccessNeeds);
      // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
      setGrantedAccessNeeds(grantedAccessNeeds);
      // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
      setAllowedAccessNeeds([
        // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
        ...missingAccessNeeds.required.map(a => (typeof a === 'string' ? a : a?.id)),
        // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
        ...missingAccessNeeds.optional.map(a => (typeof a === 'string' ? a : a?.id))
      ]);

      // If at least one required access need is missing
      if (missingAccessNeeds.required.length > 0) {
        // Show screen to get consent
        // @ts-expect-error TS(2345): Argument of type '"ask"' is not assignable to para... Remove this comment to see the full error message
        setStep('ask');
      } else {
        // Upgrade directly
        // @ts-expect-error TS(2345): Argument of type '"upgrade"' is not assignable to ... Remove this comment to see the full error message
        setStep('upgrade');
      }
    }
  }, [
    accessNeedsLoaded,
    requiredAccessNeeds,
    optionalAccessNeeds,
    accessGrantsLoaded,
    accessGrants,
    agentRegistration,
    agentRegistrationLoaded,
    setAllowedAccessNeeds,
    setGrantedAccessNeeds,
    setMissingAccessNeeds,
    step,
    setStep
  ]);

  const onRemove = useCallback(() => {
    try {
      notify('app.notification.app_removal_in_progress');
      // This will redirect to the app logout and then back to the applications page
      removeApp({ application });
    } catch (e) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      notify(`Error on app removal: ${e.message}`, { type: 'error' });
    }
  }, [removeApp, notify, application]);

  if (step !== 'ask') return <ProgressMessage message="app.notification.app_upgrade_progress" />;

  return (
    <SimpleBox
      title={translate('app.page.authorize')}
      icon={<WarningIcon />}
      text={translate('app.helper.authorize_upgrade')}
    >
      {application && (
        <>
          <AppHeader application={application} isTrustedApp={isTrustedApp} />
          <AccessNeedsList
            required
            accessNeeds={missingAccessNeeds.required}
            allowedAccessNeeds={allowedAccessNeeds}
            setAllowedAccessNeeds={setAllowedAccessNeeds}
          />
          <AccessNeedsList
            accessNeeds={missingAccessNeeds.optional}
            allowedAccessNeeds={allowedAccessNeeds}
            setAllowedAccessNeeds={setAllowedAccessNeeds}
          />
        </>
      )}
      <Box display="flex" justifyContent="end">
        <Button
          variant="contained"
          color="secondary"
          // @ts-expect-error TS(2345): Argument of type '"upgrade"' is not assignable to ... Remove this comment to see the full error message
          onClick={() => setStep('upgrade')}
          sx={{ ml: 10 }}
        >
          {translate('app.action.accept')}
        </Button>
        <Button variant="contained" onClick={() => setRejectDialogOpen(true)} sx={{ ml: 1 }}>
          {translate('app.action.reject')}
        </Button>
      </Box>
      <Dialog onClose={() => setRejectDialogOpen(false)} open={rejectDialogOpen}>
        <DialogTitle>{translate('app.message.app_upgrade_cancel')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{translate('app.message.app_upgrade_cancel_description')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" color="secondary" onClick={() => setRejectDialogOpen(false)}>
            {translate('ra.action.cancel')}
          </Button>
          <Button variant="contained" color="error" onClick={onRemove}>
            {translate('app.action.revoke_access')}
          </Button>
        </DialogActions>
      </Dialog>
    </SimpleBox>
  );
};

export default UpgradeScreen;
