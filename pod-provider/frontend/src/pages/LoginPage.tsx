import { useCallback } from 'react';
import urlJoin from 'url-join';
import { useDataProvider, useLocaleState, useTranslate } from 'react-admin';
import { LocalLoginPage } from '@semapps/auth-provider';
import { useSearchParams } from 'react-router-dom';
import { Box, Button } from '@mui/material';
import { Link } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Header from '../common/Header';
import scorer from '../config/scorer';

const LoginPageWrapper = ({ children }) => {
  const translate = useTranslate();
  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 1 }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<ArrowBackIcon />}
            aria-label={translate('ra.action.back')}
          >
            {translate('ra.action.back')}
          </Button>
        </Link>
      </Box>
      {children}
    </Box>
  );
};

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
      <Header title={isSignup ? 'app.titles.signup' : 'app.titles.login'} />
      <LoginPageWrapper>
        <LocalLoginPage
          allowUsername
          onLogin={onLogin}
          onSignup={onSignup}
          additionalSignupValues={{ 'schema:knowsLanguage': locale }}
          passwordScorer={scorer}
        />
      </LoginPageWrapper>
    </>
  );
};

export default LoginPage;
