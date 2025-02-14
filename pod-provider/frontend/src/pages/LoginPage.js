import { useCallback } from 'react';
import urlJoin from 'url-join';
import { useDataProvider, useLocaleState, useTranslate } from 'react-admin';
import { LocalLoginPage } from '@semapps/auth-provider';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import scorer from '../config/scorer';

const LoginPage = () => {
  const dataProvider = useDataProvider();
  const [searchParams] = useSearchParams();
  const interactionId = searchParams.get('interaction_id');
  const [locale] = useLocaleState();
  const translate = useTranslate();
  const isSignup = searchParams.get('signup') !== null;

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
    <>
      <Helmet>
        <title>
          {translate(isSignup ? 'app.titles.signup' : 'app.titles.login', {
            appName: CONFIG.INSTANCE_NAME
          })}
        </title>
      </Helmet>
      <LocalLoginPage
        allowUsername
        onLogin={onLogin}
        onSignup={onSignup}
        additionalSignupValues={{ 'schema:knowsLanguage': locale }}
        passwordScorer={scorer}
      />
    </>
  );
};

export default LoginPage;
