import React, { useEffect, useCallback, useState } from 'react';
import urlJoin from 'url-join';
import { Link, useTranslate, useNotify, useDataProvider } from 'react-admin';
import { Box, Button } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
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
  const translate = useTranslate();
  const notify = useNotify();

  const { requiredAccessNeeds, optionalAccessNeeds, loaded } = useAccessNeeds(application);
  const { classDescriptions } = useClassDescriptions(application);
  const { data: typeRegistrations } = useTypeRegistrations();
  const dataProvider = useDataProvider();

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

      await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.auth-agent', 'install'), {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          appUri: application.id,
          acceptedAccessNeeds: allowedAccessNeeds.filter(a => !a.startsWith('apods:')),
          acceptedSpecialRights: allowedAccessNeeds.filter(a => a.startsWith('apods:'))
        })
      });

      await accessApp();
    } catch (e) {
      setIsInstalling(false);
      notify(`Error on app installation: ${e.message}`, { type: 'error' });
    }
  }, [dataProvider, notify, application, allowedAccessNeeds, accessApp, setIsInstalling]);

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
          <Button variant="contained" color="error" sx={{ ml: 1 }}>
            {translate('app.action.reject')}
          </Button>
        </Link>
      </Box>
    </SimpleBox>
  );
};

export default InstallationScreen;
