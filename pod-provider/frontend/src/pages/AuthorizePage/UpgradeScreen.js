import React, { useEffect, useState } from 'react';
import urlJoin from 'url-join';
import { useTranslate, useNotify, useDataProvider } from 'react-admin';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import SimpleBox from '../../layout/SimpleBox';
import useAccessNeeds from '../../hooks/useAccessNeeds';
import useGrants from '../../hooks/useGrants';
import useClassDescriptions from '../../hooks/useClassDescriptions';
import AccessNeedsList from './AccessNeedsList';
import ProgressMessage from '../../common/ProgressMessage';
import useTypeRegistrations from '../../hooks/useTypeRegistrations';
import AppHeader from './AppHeader';
import { arrayOf } from '../../utils';
import useUninstallApp from '../../hooks/useUninstallApp';

const UpgradeScreen = ({ application, accessApp, isTrustedApp }) => {
  const [step, setStep] = useState();
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
  const [allowedAccessNeeds, setAllowedAccessNeeds] = useState([]);
  const [grantedAccessNeeds, setGrantedAccessNeeds] = useState([]);
  const [missingAccessNeeds, setMissingAccessNeeds] = useState({ required: [], optional: [] });
  const dataProvider = useDataProvider();
  const translate = useTranslate();
  const notify = useNotify();
  const uninstallApp = useUninstallApp(application);

  const { requiredAccessNeeds, optionalAccessNeeds, loaded: accessNeedsLoaded } = useAccessNeeds(application);
  const { classDescriptions } = useClassDescriptions(application);
  const { data: typeRegistrations } = useTypeRegistrations();

  const { grants, loaded: grantsLoaded } = useGrants(application.id);

  useEffect(() => {
    (async () => {
      if (step === 'upgrade') {
        try {
          setStep('upgrading');

          await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.auth-agent', 'upgrade'), {
            method: 'POST',
            headers: new Headers({
              'Content-Type': 'application/json'
            }),
            body: JSON.stringify({
              appUri: application.id,
              acceptedAccessNeeds: [...grantedAccessNeeds, ...allowedAccessNeeds].filter(a => !a.startsWith('apods:')),
              acceptedSpecialRights: [...grantedAccessNeeds, ...allowedAccessNeeds].filter(a => a.startsWith('apods:'))
            })
          });

          await accessApp();
        } catch (e) {
          setStep('error');
          notify(`Error on app upgrade: ${e.message}`, { type: 'error' });
        }
      }
    })();
  }, [dataProvider, notify, application, allowedAccessNeeds, grantedAccessNeeds, accessApp, step, setStep]);

  useEffect(() => {
    if (accessNeedsLoaded && grantsLoaded && !step) {
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
              ? grants.find(g => typeof g === 'string' && g === accessNeed)
              : grants.find(
                  g =>
                    typeof g !== 'string' &&
                    g['apods:registeredClass'] === accessNeed['apods:registeredClass'] &&
                    // Every mode in the access need must be in the existing grant.
                    // If the existing grant has more access mode, we will not ask user consent to remove it
                    arrayOf(accessNeed['interop:accessMode']).every(m => arrayOf(g['interop:accessMode']).includes(m))
                );

          if (matchingGrant) {
            grantedAccessNeeds.push(typeof accessNeed === 'string' ? accessNeed : accessNeed.id);
          } else {
            missingAccessNeeds[necessity].push(accessNeed);
          }
        }
      }

      setMissingAccessNeeds(missingAccessNeeds);
      setGrantedAccessNeeds(grantedAccessNeeds);
      setAllowedAccessNeeds([
        ...missingAccessNeeds.required.map(a => (typeof a === 'string' ? a : a?.id)),
        ...missingAccessNeeds.optional.map(a => (typeof a === 'string' ? a : a?.id))
      ]);

      // If at least one required access need is missing
      if (missingAccessNeeds.required.length > 0) {
        // Show screen to get consent
        setStep('ask');
      } else {
        // Upgrade directly
        setStep('upgrade');
      }
    }
  }, [
    accessNeedsLoaded,
    requiredAccessNeeds,
    optionalAccessNeeds,
    grantsLoaded,
    grants,
    setAllowedAccessNeeds,
    setGrantedAccessNeeds,
    setMissingAccessNeeds,
    step,
    setStep
  ]);

  if (step !== 'ask') return <ProgressMessage message="app.message.app_upgrade_progress" />;

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
            classDescriptions={classDescriptions}
            typeRegistrations={typeRegistrations}
          />
          <AccessNeedsList
            accessNeeds={missingAccessNeeds.optional}
            allowedAccessNeeds={allowedAccessNeeds}
            setAllowedAccessNeeds={setAllowedAccessNeeds}
            classDescriptions={classDescriptions}
            typeRegistrations={typeRegistrations}
          />
        </>
      )}
      <Box display="flex" justifyContent="end">
        <Button variant="contained" color="secondary" onClick={() => setStep('upgrade')} sx={{ ml: 10 }}>
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
          <Button variant="contained" color="error" onClick={() => uninstallApp()}>
            {translate('app.action.uninstall_app')}
          </Button>
        </DialogActions>
      </Dialog>
    </SimpleBox>
  );
};

export default UpgradeScreen;
