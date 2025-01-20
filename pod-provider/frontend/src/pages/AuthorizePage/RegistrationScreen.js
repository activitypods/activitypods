import React, { useEffect, useCallback, useState } from 'react';
import { Link, useTranslate, useNotify } from 'react-admin';
import { Box, Button } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import SimpleBox from '../../layout/SimpleBox';
import useAccessNeeds from '../../hooks/useAccessNeeds';
import useClassDescriptions from '../../hooks/useClassDescriptions';
import AccessNeedsList from '../../common/list/AccessNeedsList';
import ProgressMessage from '../../common/ProgressMessage';
import useTypeRegistrations from '../../hooks/useTypeRegistrations';
import AppHeader from './AppHeader';
import useRegisterApp from '../../hooks/useRegisterApp';

const RegistrationScreen = ({ application, accessApp, isTrustedApp }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [grantedAccessNeedsUris, setGrantedAccessNeedsUris] = useState();
  const translate = useTranslate();
  const notify = useNotify();
  const registerApp = useRegisterApp();

  const { requiredAccessNeeds, optionalAccessNeeds, loaded } = useAccessNeeds(application);
  const { classDescriptions } = useClassDescriptions(application);
  const { data: typeRegistrations } = useTypeRegistrations();

  useEffect(() => {
    if (loaded) {
      setGrantedAccessNeedsUris([
        ...requiredAccessNeeds.map(a => (typeof a === 'string' ? a : a?.id)),
        ...optionalAccessNeeds.map(a => (typeof a === 'string' ? a : a?.id))
      ]);
    }
  }, [loaded, requiredAccessNeeds, optionalAccessNeeds, setGrantedAccessNeedsUris]);

  const onRegister = useCallback(async () => {
    try {
      setIsRegistering(true);

      await registerApp({ appUri: application.id, grantedAccessNeeds: grantedAccessNeedsUris });

      await accessApp();
    } catch (e) {
      setIsRegistering(false);
      notify(`Error on app registration: ${e.message}`, { type: 'error' });
    }
  }, [registerApp, notify, application, grantedAccessNeedsUris, accessApp, setIsRegistering]);

  if (isRegistering) return <ProgressMessage message="app.notification.app_registration_progress" />;

  return (
    <SimpleBox
      title={translate('app.page.authorize')}
      icon={<WarningIcon />}
      text={translate('app.helper.authorize_register')}
    >
      {application && (
        <>
          <AppHeader application={application} isTrustedApp={isTrustedApp} />
          <AccessNeedsList
            required
            accessNeeds={requiredAccessNeeds}
            allowedAccessNeeds={grantedAccessNeedsUris}
            setAllowedAccessNeeds={setGrantedAccessNeedsUris}
            classDescriptions={classDescriptions}
            typeRegistrations={typeRegistrations}
          />
          <AccessNeedsList
            accessNeeds={optionalAccessNeeds}
            allowedAccessNeeds={grantedAccessNeedsUris}
            setAllowedAccessNeeds={setGrantedAccessNeedsUris}
            classDescriptions={classDescriptions}
            typeRegistrations={typeRegistrations}
          />
        </>
      )}
      <Box display="flex" justifyContent="end">
        <Button variant="contained" color="secondary" onClick={onRegister} sx={{ ml: 10 }}>
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

export default RegistrationScreen;
