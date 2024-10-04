import { useCallback } from 'react';
import urlJoin from 'url-join';
import { useDataProvider } from 'react-admin';
import { LocalLoginPage } from '@semapps/auth-provider';
import { useSearchParams } from 'react-router-dom';
import scorer from '../config/scorer';

const LoginPage = () => {
  const dataProvider = useDataProvider();
  const [searchParams] = useSearchParams();
  const interactionId = searchParams.get('interaction_id');

  const finishInteraction = useCallback(async () => {
    if (interactionId) {
      await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.oidc/login-completed'), {
        method: 'POST',
        body: JSON.stringify({ interactionId }),
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
    }
  }, [interactionId, dataProvider]);

  const onLogin = useCallback(
    async redirectUrl => {
      await finishInteraction();
      window.location.href = redirectUrl;
    },
    [finishInteraction]
  );

  const onSignup = useCallback(
    async redirectUrl => {
      await finishInteraction();
      window.location.href = `/initialize?redirect=${encodeURIComponent(redirectUrl)}`;
    },
    [finishInteraction]
  );

  return (
    <LocalLoginPage
      allowUsername
      onLogin={onLogin}
      onSignup={onSignup}
      additionalSignupValues={{ 'schema:knowsLanguage': CONFIG.DEFAULT_LOCALE }}
      passwordScorer={scorer}
    />
  );
};

export default LoginPage;
