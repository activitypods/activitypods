import { useCallback, useEffect, useRef, useState } from 'react';
import { useGetIdentity, useGo, useTranslate } from '@refinedev/core';
import { STORAGE_KEY_REDIRECT, arrayOf } from '@activitypods/refine-providers';
import useAuthProvider from './useAuthProvider';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type BackgroundChecksOptions = {
  /** URIs (typically the user's inbox and outbox) the app backend must have a webhook channel on */
  listeningTo?: string[];
  /** In ms, or `false` to check only once. Checks also run on every visibility change. */
  checkInterval?: number | false;
};

/**
 * Check the app status while logged in: redirect to the consent screen if the app is not
 * registered or its access needs changed, and report an error if the backend is offline or
 * not listening to the `listeningTo` URIs.
 */
const useBackgroundChecks = ({ listeningTo = [], checkInterval = 120000 }: BackgroundChecksOptions = {}) => {
  const authProvider = useAuthProvider();
  const translate = useTranslate();
  const go = useGo();
  const { data: identity, isLoading: isIdentityLoading } = useGetIdentity();
  const [isChecked, setIsChecked] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const isLoggedIn = !!identity;
  const isLoggedOut = !isIdentityLoading && !identity;

  // Usually an inline array: compare by content
  const listeningToKey = listeningTo.join(' ');
  const listeningToRef = useRef(listeningTo);
  listeningToRef.current = listeningTo;

  const check = useCallback(async () => {
    if (document.hidden) return;
    const session = authProvider.getSession();
    if (!session) return;

    try {
      let appStatus = await authProvider.getAppStatus();

      if (!appStatus.onlineBackend) {
        setError(translate('apods.error.app_offline', 'The app backend is offline'));
        return;
      }

      if (!appStatus.installed || appStatus.upgradeNeeded) {
        // Resolves with undefined when leaving for the consent screen
        const appRegistrationUri = await authProvider.registerApp(session.webId);
        if (!appRegistrationUri) return;
      }

      let missingListener: string | undefined;
      for (let attempt = 0; attempt < 10; attempt++) {
        missingListener = listeningToRef.current.find(
          uri => !arrayOf(appStatus.webhookChannels).some(channel => channel.topic === uri)
        );
        if (!missingListener) break;
        // Webhook channels are created shortly after the app registration
        await delay(1000);
        appStatus = await authProvider.getAppStatus();
      }

      if (missingListener) {
        setError(
          translate('apods.error.app_not_listening', { uri: missingListener }, 'The app is not listening to {{uri}}')
        );
        return;
      }

      setError(undefined);
      setIsChecked(true);
    } catch (e) {
      console.error(e);
      setError(translate('apods.error.app_status_unavailable', 'Unable to check app status'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authProvider, translate, listeningToKey]);

  useEffect(() => {
    if (!isLoggedIn) return;
    check();
    document.addEventListener('visibilitychange', check);
    const timerId = checkInterval === false ? undefined : setInterval(check, checkInterval);
    return () => {
      document.removeEventListener('visibilitychange', check);
      clearInterval(timerId);
    };
  }, [isLoggedIn, check, checkInterval]);

  // Back from the consent screen: return to the page saved by registerApp()
  useEffect(() => {
    if (!isLoggedIn) return;
    const redirectUrl = localStorage.getItem(STORAGE_KEY_REDIRECT);
    if (redirectUrl) {
      localStorage.removeItem(STORAGE_KEY_REDIRECT);
      go({ to: redirectUrl, type: 'replace' });
    }
  }, [isLoggedIn, go]);

  const retry = useCallback(() => {
    setError(undefined);
    check();
  }, [check]);

  return { isLoggedOut, isChecked, error, retry };
};

export default useBackgroundChecks;
