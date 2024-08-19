import React, { useEffect, useCallback, useState } from 'react';
import { Link, useTranslate, useNotify } from 'react-admin';
import { Box, Button } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import { useOutbox, useInbox } from '@semapps/activitypub-components';
import SimpleBox from '../../layout/SimpleBox';
import useAccessNeeds from '../../hooks/useAccessNeeds';
import useClassDescriptions from '../../hooks/useClassDescriptions';
import AccessNeedsList from './AccessNeedsList';
import ProgressMessage from '../../common/ProgressMessage';
import useTypeRegistrations from '../../hooks/useTypeRegistrations';
import AppHeader from './AppHeader';

const InstallationScreen = ({ application, accessApp, isTrustedApp }) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [allowedAccessNeeds, setAllowedAccessNeeds] = useState();
  const outbox = useOutbox();
  const inbox = useInbox();
  const translate = useTranslate();
  const notify = useNotify();

  const { requiredAccessNeeds, optionalAccessNeeds, loaded } = useAccessNeeds(application);
  const { classDescriptions } = useClassDescriptions(application);
  const { data: typeRegistrations } = useTypeRegistrations();

  useEffect(() => {
    if (loaded) {
      setAllowedAccessNeeds([
        ...requiredAccessNeeds.map(a => (typeof a === 'string' ? a : a?.id)),
        ...optionalAccessNeeds.map(a => (typeof a === 'string' ? a : a?.id))
      ]);
    }
  }, [loaded, requiredAccessNeeds, optionalAccessNeeds, setAllowedAccessNeeds]);

  const installApp = useCallback(async () => {
    try {
      setIsInstalling(true);

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
        type: 'apods:Install',
        actor: outbox.owner,
        object: application.id,
        'apods:acceptedAccessNeeds': allowedAccessNeeds.filter(a => !a.startsWith('apods:')),
        'apods:acceptedSpecialRights': allowedAccessNeeds.filter(a => a.startsWith('apods:'))
      });

      // TODO Allow to pass an object, and automatically dereference it, like on the @semapps/activitypub matchActivity util
      const createRegistrationActivity = await outbox.awaitActivity(
        activity => activity.type === 'Create' && activity.to === application.id
      );

      await inbox.awaitActivity(
        activity =>
          activity.type === 'Accept' &&
          activity.actor === application.id &&
          activity.object === createRegistrationActivity.id
      );

      await accessApp();
    } catch (e) {
      setIsInstalling(false);
      notify(`Error on app installation: ${e.message}`, { type: 'error' });
    }
  }, [outbox, inbox, notify, application, allowedAccessNeeds, accessApp, setIsInstalling]);

  if (isInstalling) return <ProgressMessage message="app.message.app_installation_progress" />;

  return (
    <SimpleBox
      title={translate('app.page.authorize')}
      icon={<WarningIcon />}
      text={translate('app.helper.authorize_install')}
    >
      {application && (
        <>
          <AppHeader application={application} isTrustedApp={isTrustedApp} />
          <AccessNeedsList
            required
            accessNeeds={requiredAccessNeeds}
            allowedAccessNeeds={allowedAccessNeeds}
            setAllowedAccessNeeds={setAllowedAccessNeeds}
            classDescriptions={classDescriptions}
            typeRegistrations={typeRegistrations}
          />
          <AccessNeedsList
            accessNeeds={optionalAccessNeeds}
            allowedAccessNeeds={allowedAccessNeeds}
            setAllowedAccessNeeds={setAllowedAccessNeeds}
            classDescriptions={classDescriptions}
            typeRegistrations={typeRegistrations}
          />
        </>
      )}
      <Box display="flex" justifyContent="end">
        <Button variant="contained" color="secondary" onClick={installApp} sx={{ ml: 10 }}>
          {translate('app.action.accept')}
        </Button>
        <Link to="/apps">
          <Button variant="contained" sx={{ ml: 1 }}>
            {translate('app.action.reject')}
          </Button>
        </Link>
      </Box>
    </SimpleBox>
  );
};

export default InstallationScreen;
