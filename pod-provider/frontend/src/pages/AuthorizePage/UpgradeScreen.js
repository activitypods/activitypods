import React, { useEffect, useState } from 'react';
import { useTranslate, useNotify } from 'react-admin';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import { useOutbox, useInbox } from '@semapps/activitypub-components';
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
  const outbox = useOutbox();
  const inbox = useInbox();
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

          await outbox.awaitWebSocketConnection();

          // Do not await to ensure we don't miss the activities below
          outbox.post({
            '@context': [
              'https://www.w3.org/ns/activitystreams',
              {
                apods: 'http://activitypods.org/ns/core#',
                'apods:acceptedAccessNeeds': {
                  '@type': '@id'
                },
                'apods:acceptedSpecialRights': {
                  '@type': '@id'
                }
              }
            ],
            type: 'apods:Upgrade',
            actor: outbox.owner,
            object: application.id,
            'apods:acceptedAccessNeeds': [...grantedAccessNeeds, ...allowedAccessNeeds].filter(
              a => !a.startsWith('apods:')
            ),
            'apods:acceptedSpecialRights': [...grantedAccessNeeds, ...allowedAccessNeeds].filter(a =>
              a.startsWith('apods:')
            )
          });

          // TODO Allow to pass an object, and automatically dereference it, like on the @semapps/activitypub matchActivity util
          const updateRegistrationActivity = await outbox.awaitActivity(
            activity => activity.type === 'Update' && activity.to === application.id
          );

          await inbox.awaitActivity(
            activity =>
              activity.type === 'Accept' &&
              activity.actor === application.id &&
              activity.object === updateRegistrationActivity.id
          );

          await accessApp();
        } catch (e) {
          setStep('error');
          notify(`Error on app upgrade: ${e.message}`, { type: 'error' });
        }
      }
    })();
  }, [outbox, inbox, notify, application, allowedAccessNeeds, grantedAccessNeeds, accessApp, step, setStep]);

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
