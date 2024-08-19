import React, { useEffect, useCallback, useState } from 'react';
import { Link, useTranslate, useGetList, useNotify, useDataProvider } from 'react-admin';
import urlJoin from 'url-join';
import { Box, Button } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import WarningIcon from '@mui/icons-material/Warning';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { useOutbox, useInbox } from '@semapps/activitypub-components';
import SimpleBox from '../../layout/SimpleBox';
import useTrustedApps from '../../hooks/useTrustedApps';
import useApplication from '../../hooks/useApplication';
import useAccessNeeds from '../../hooks/useAccessNeeds';
import useClassDescriptions from '../../hooks/useClassDescriptions';
import AccessNeedsList from './AccessNeedsList';
import ProgressMessage from '../../common/ProgressMessage';
import useTypeRegistrations from '../../hooks/useTypeRegistrations';
import AppHeader from './AppHeader';

const AuthorizePage = () => {
  useCheckAuthenticated();
  const [showScreen, setShowScreen] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [allowedAccessNeeds, setAllowedAccessNeeds] = useState();
  const outbox = useOutbox();
  const inbox = useInbox();
  const translate = useTranslate();
  const trustedApps = useTrustedApps();
  const [searchParams] = useSearchParams();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const { data: appRegistrations, isLoading } = useGetList('AppRegistration', { page: 1, perPage: Infinity });
  const redirectTo = searchParams.get('redirect');
  const clientId = searchParams.get('client_id');
  const interactionId = searchParams.get('interaction_id');
  const clientDomain = new URL(clientId).host;
  const isTrustedApp = trustedApps.some(domain => domain === clientDomain);

  if (!clientId) throw new Error('The client ID is missing !');

  const application = useApplication(clientDomain);
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

  const accessApp = useCallback(async () => {
    await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.oidc/consent-completed'), {
      method: 'POST',
      body: JSON.stringify({ interactionId }),
      headers: new Headers({ 'Content-Type': 'application/json' })
    });

    window.location.href = redirectTo;
  }, [dataProvider, interactionId, redirectTo]);

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

      accessApp();
    } catch (e) {
      setIsInstalling(false);
      notify(`Error on app installation: ${e.message}`, { type: 'error' });
    }
  }, [outbox, inbox, notify, application, allowedAccessNeeds, accessApp, setIsInstalling]);

  // Once all data are loaded, either redirect to app or show authorization screen
  useEffect(() => {
    if (!isLoading && application?.id && clientDomain) {
      if (appRegistrations.some(reg => reg['interop:registeredAgent'] === application?.id)) {
        accessApp();
      } else {
        setShowScreen(true);
      }
    }
  }, [appRegistrations, isLoading, clientDomain, application, accessApp, setShowScreen]);

  if (!showScreen) return null;

  if (isInstalling) return <ProgressMessage message="app.message.app_installation_progress" />;

  return (
    <SimpleBox
      title={translate('app.page.authorize')}
      icon={<WarningIcon />}
      text={translate('app.helper.authorize', { appDomain: clientDomain })}
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

export default AuthorizePage;
