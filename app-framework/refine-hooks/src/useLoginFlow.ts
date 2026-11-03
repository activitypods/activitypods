import { useContext, useEffect, useRef, useState } from 'react';
import { I18nContext, useGetIdentity, useGo, useLogin, useLogout, useParsed, useTranslate } from '@refinedev/core';
import type { LoginParams } from '@activitypods/refine-providers';
import useAuthProvider from './useAuthProvider';

const POD_PROVIDERS_URL = 'https://activitypods.org/data/pod-providers';

// The consent screen comes back to a fixed URL, without our search params
const STORAGE_KEY_PAGE_REDIRECT = 'activitypods.authPageRedirect';

const storage = {
  get: () => {
    try {
      return localStorage.getItem(STORAGE_KEY_PAGE_REDIRECT) || undefined;
    } catch {
      return undefined;
    }
  },
  set: (path: string) => {
    try {
      localStorage.setItem(STORAGE_KEY_PAGE_REDIRECT, path);
    } catch {}
  },
  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY_PAGE_REDIRECT);
    } catch {}
  }
};

// Never redirect to an absolute URL
const isPath = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('/') && !/\s/.test(value);

export type PodProvider = {
  'apods:baseUrl': string;
  'apods:area'?: string;
  'apods:locales'?: string | string[];
  'apods:providedBy'?: string;
};

export type LoginFlowOptions = {
  /** Replaces the public list of Pod providers */
  customPodProviders?: PodProvider[];
  /** Offer only this Pod provider (e.g. a local one in development) */
  defaultPodProvider?: string;
  /** Where to go once logged in. Defaults to `/`. */
  redirect?: string;
};

type SearchParams = {
  code?: string;
  register_app?: string;
  signup?: string;
  iss?: string;
  logout?: string;
  redirect?: string;
};

/**
 * Logic of the login page, which handles every step of the Solid-OIDC flow depending on the search params:
 * - none: list the Pod providers
 * - `?code`: complete the authorization code exchange
 * - `?register_app`: make sure the app is registered, then redirect
 * Also handles `?iss`, `?signup`, `?logout` and `?redirect`.
 */
const useLoginFlow = ({
  customPodProviders,
  defaultPodProvider,
  redirect: defaultRedirect = '/'
}: LoginFlowOptions = {}) => {
  const authProvider = useAuthProvider();
  const translate = useTranslate();
  // useGetLocale throws without an i18nProvider
  const { i18nProvider } = useContext(I18nContext);
  const go = useGo();
  const { params = {} } = useParsed<SearchParams>();
  const { mutate: login } = useLogin<LoginParams>();
  const { mutate: logout } = useLogout();
  const { data: identity, isLoading: isIdentityLoading, refetch: refetchIdentity } = useGetIdentity();

  const initialPodProviders =
    customPodProviders || (defaultPodProvider ? [{ 'apods:baseUrl': defaultPodProvider }] : []);
  const [podProviders, setPodProviders] = useState<PodProvider[]>(initialPodProviders);
  const [error, setError] = useState<string | undefined>();
  const [isRegistered, setIsRegistered] = useState(false);

  const locale = i18nProvider?.getLocale()?.split(/[-_]/)[0];
  const isSignup = 'signup' in params;
  const hasCode = !!params.code;
  const hasRegisterApp = 'register_app' in params;
  const isProcessing = hasCode || hasRegisterApp;
  const redirect =
    (isPath(params.redirect) ? params.redirect : undefined) ||
    (isProcessing ? storage.get() : undefined) ||
    defaultRedirect;

  useEffect(() => {
    if (initialPodProviders.length > 0 || isProcessing) return;
    let cancelled = false;
    fetch(POD_PROVIDERS_URL, { headers: { Accept: 'application/ld+json' } })
      .then(response => {
        if (!response.ok) throw new Error(response.statusText);
        return response.json();
      })
      .then(json => {
        if (cancelled) return;
        const providers: PodProvider[] = json['ldp:contains'] || [];
        setPodProviders(
          locale
            ? providers.filter(provider => {
                const locales = provider['apods:locales'];
                return Array.isArray(locales) ? locales.includes(locale) : locales === locale;
              })
            : providers
        );
      })
      .catch(() => {
        if (!cancelled)
          setError(translate('pages.login.podProvidersNotLoaded', 'Unable to load the list of Pod providers'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPodProviders.length, isProcessing, locale]);

  const handledShortcut = useRef(false);
  useEffect(() => {
    if (isProcessing || handledShortcut.current) return;
    if (params.iss) {
      handledShortcut.current = true;
      login({ issuer: params.iss, redirect, isSignup });
    } else if ('logout' in params) {
      handledShortcut.current = true;
      logout({ redirectPath: redirect });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, params.iss]);

  const handledCode = useRef(false);
  useEffect(() => {
    if (!hasCode || handledCode.current) return;
    handledCode.current = true;
    authProvider
      .handleCallback()
      .then(({ redirect: postLoginRedirect }) =>
        go({ query: { register_app: '1', redirect: postLoginRedirect }, type: 'replace' })
      )
      .catch(e => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCode]);

  const handledRegistration = useRef(false);
  useEffect(() => {
    if (!hasRegisterApp || hasCode || handledRegistration.current) return;
    handledRegistration.current = true;
    const session = authProvider.getSession();
    if (!session) {
      setError('You must be logged in to register this app.');
      return;
    }
    storage.set(redirect);
    authProvider
      .registerApp(session.webId)
      .then(async appRegistrationUri => {
        // If undefined, we are leaving for the consent screen
        if (appRegistrationUri) {
          // Refine cached the identity as logged out before the login
          await refetchIdentity();
          setIsRegistered(true);
        }
      })
      .catch(e => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRegisterApp, hasCode]);

  useEffect(() => {
    if (isRegistered && !isIdentityLoading && identity) {
      storage.clear();
      go({ to: redirect, type: 'replace' });
    }
  }, [isRegistered, isIdentityLoading, identity, go, redirect]);

  return {
    isProcessing,
    error,
    podProviders,
    login: (podProvider: PodProvider) => login({ issuer: podProvider['apods:baseUrl'], redirect, isSignup }),
    backToLogin: () => go({ to: '/login', type: 'replace' })
  };
};

export default useLoginFlow;
