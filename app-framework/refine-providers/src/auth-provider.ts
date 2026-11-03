import jwtDecode from 'jwt-decode';
import * as oauth from 'oauth4webapi';
import { fetchAppStatus, fetchJson, resolveAuthAgent } from './utils';
import { AuthProvider, AuthProviderConfig, AuthSession, LoginParams } from './types';

const STORAGE_KEY_TOKEN = 'activitypods.token';
const STORAGE_KEY_CODE_VERIFIER = 'activitypods.codeVerifier';
/**
 * Where to return to once a flow completes. Set by `login()` (read back by `handleCallback()`)
 * and by `registerApp()` before leaving for the consent screen (read back by
 * `AntdBackgroundChecks` when the user comes back).
 */
export const STORAGE_KEY_REDIRECT = 'activitypods.redirect';

type SolidOidcIdTokenPayload = {
  webid: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  [key: string]: unknown;
};

const readSession = (): AuthSession | undefined => {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (!token) return undefined;

  try {
    const payload = jwtDecode<SolidOidcIdTokenPayload>(token);
    if (payload.exp && Date.now() >= payload.exp * 1000) return undefined;
    if (!payload.webid) return undefined;
    return { token, webId: payload.webid };
  } catch {
    return undefined;
  }
};

const clearSession = () => {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_CODE_VERIFIER);
  localStorage.removeItem(STORAGE_KEY_REDIRECT);
};

// A failed status probe shouldn't block an otherwise-working, already-registered app: fail
// open (assume no upgrade needed) rather than surfacing this as a login-blocking error.
const isUpgradeNeeded = async (webId: string, token: string): Promise<boolean> => {
  try {
    const status = await fetchAppStatus(webId, token);
    return status.upgradeNeeded === true;
  } catch {
    return false;
  }
};

/**
 * Refine auth provider for ActivityPods, using the Solid-OIDC flow (the only authentication
 * method supported by ActivityPods Pod providers).
 *
 * Since a Pod provider is only known once the user has picked one, `login()` expects an
 * `issuer` parameter (the base URL of the Pod provider). It is up to the app to let the user
 * choose a Pod provider (see the README for an example using the public providers list).
 */
const authProvider = ({
  clientId,
  redirectUri,
  allowAnonymous = false,
  appStatusCheckInterval = 120_000
}: AuthProviderConfig): AuthProvider => {
  const getRedirectUri = () => redirectUri || `${window.location.origin}/login`;

  const startLogin = async ({ issuer, redirect = '/', isSignup = false }: LoginParams) => {
    if (!issuer) {
      return { success: false, error: new Error('A Pod provider `issuer` URL is required to log in') };
    }

    try {
      const issuerUrl = new URL(issuer);
      const as = await oauth
        .discoveryRequest(issuerUrl)
        .then(response => oauth.processDiscoveryResponse(issuerUrl, response));

      const codeVerifier = oauth.generateRandomCodeVerifier();
      const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);

      localStorage.setItem(STORAGE_KEY_CODE_VERIFIER, codeVerifier);
      localStorage.setItem(STORAGE_KEY_REDIRECT, redirect);

      const authorizationUrl = new URL(as.authorization_endpoint!);
      authorizationUrl.searchParams.set('response_type', 'code');
      authorizationUrl.searchParams.set('client_id', clientId);
      authorizationUrl.searchParams.set('code_challenge', codeChallenge);
      authorizationUrl.searchParams.set('code_challenge_method', 'S256');
      authorizationUrl.searchParams.set('redirect_uri', getRedirectUri());
      authorizationUrl.searchParams.set('scope', 'openid webid offline_access');
      if (isSignup) authorizationUrl.searchParams.set('is_signup', 'true');

      window.location.href = authorizationUrl.toString();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  };

  const provider: AuthProvider = {
    login: startLogin,
    register: (params: LoginParams) => startLogin({ ...params, isSignup: true }),

    logout: async () => {
      clearSession();
      return { success: true, redirectTo: '/login' };
    },

    check: async () => {
      const session = readSession();
      if (session) return { authenticated: true };
      return {
        authenticated: allowAnonymous,
        redirectTo: allowAnonymous ? undefined : '/login'
      };
    },

    onError: async error => {
      if (error?.status === 401) {
        return { logout: true, redirectTo: '/login', error };
      }
      return { error };
    },

    getPermissions: async () => undefined,

    getIdentity: async () => {
      const session = readSession();
      if (!session) return null;

      try {
        const { json: webIdData } = await fetchJson(session.webId, {}, session.token);

        let profileData: Record<string, any> = {};
        if (webIdData?.url) {
          const { json } = await fetchJson(webIdData.url, {}, session.token);
          profileData = json || {};
        }

        return {
          id: session.webId,
          name:
            profileData['vcard:given-name'] ||
            profileData['pair:label'] ||
            webIdData?.['foaf:name'] ||
            webIdData?.['pair:label'] ||
            session.webId,
          avatar: profileData['vcard:photo'] || webIdData?.image?.url || webIdData?.image || webIdData?.icon,
          webIdData,
          profileData
        };
      } catch {
        return { id: session.webId, name: session.webId };
      }
    },

    getSession: readSession,

    handleCallback: async () => {
      const currentUrl = new URL(window.location.href);
      const issuer = currentUrl.searchParams.get('iss');
      if (!issuer) throw new Error('Missing `iss` query parameter on the auth callback URL');

      const codeVerifier = localStorage.getItem(STORAGE_KEY_CODE_VERIFIER);
      if (!codeVerifier) throw new Error('Missing PKCE code verifier: did you call `login()` first?');

      const issuerUrl = new URL(issuer);
      const as = await oauth
        .discoveryRequest(issuerUrl)
        .then(response => oauth.processDiscoveryResponse(issuerUrl, response));

      const client = { client_id: clientId, token_endpoint_auth_method: 'none' as const };

      const params = oauth.validateAuthResponse(as, client, currentUrl, oauth.expectNoState);
      if (oauth.isOAuth2Error(params)) {
        throw new Error(`OAuth error: ${params.error} (${params.error_description})`);
      }

      const response = await oauth.authorizationCodeGrantRequest(as, client, params, getRedirectUri(), codeVerifier);
      const result = await oauth.processAuthorizationCodeOpenIDResponse(as, client, response);
      if (oauth.isOAuth2Error(result)) {
        throw new Error(`OAuth error: ${result.error} (${result.error_description})`);
      }
      if (!result.id_token) throw new Error('The Pod provider did not return an ID token');

      const { webid: webId } = jwtDecode<SolidOidcIdTokenPayload>(result.id_token);
      const redirect = localStorage.getItem(STORAGE_KEY_REDIRECT) || '/';

      localStorage.setItem(STORAGE_KEY_TOKEN, result.id_token);
      localStorage.removeItem(STORAGE_KEY_CODE_VERIFIER);
      localStorage.removeItem(STORAGE_KEY_REDIRECT);

      return { webId, redirect };
    },

    registerApp: async (webId?: string) => {
      const session = readSession();
      const resolvedWebId = webId || session?.webId;
      if (!resolvedWebId) throw new Error('No WebID available: is the user logged in?');

      const { authAgent, appRegistrationUri } = await resolveAuthAgent(resolvedWebId, session?.token);

      if (appRegistrationUri) {
        const upgradeNeeded = session?.token && (await isUpgradeNeeded(resolvedWebId, session.token));
        if (!upgradeNeeded) return appRegistrationUri;
      }

      // Either there's no AppRegistration yet, or the previously granted access needs are
      // stale (e.g. the app now declares an access need the user hasn't granted): redirect to
      // the authorization agent's consent screen. Save where to return to once it's done.
      localStorage.setItem(STORAGE_KEY_REDIRECT, window.location.pathname + window.location.search);

      const redirectUrl = new URL(authAgent['interop:hasAuthorizationRedirectEndpoint']);
      redirectUrl.searchParams.set('client_id', clientId);
      window.location.href = redirectUrl.toString();
      return undefined;
    },

    getAppStatus: async () => {
      const session = readSession();
      if (!session) throw new Error('Not authenticated');
      return fetchAppStatus(session.webId, session.token);
    }
  };

  // Periodically check whether this app's granted access needs are still up to date, and
  // silently redirect to the consent screen if not — e.g. after a new resource was added to
  // the app since the user last granted access. Mirrors ActivityPods' own `BackgroundChecks`
  // component. Runs on an interval and on every `visibilitychange`; a no-op while logged out.
  if (appStatusCheckInterval !== false) {
    const checkAppStatus = async () => {
      if (document.hidden) return;
      const session = readSession();
      if (!session) return;
      if (await isUpgradeNeeded(session.webId, session.token)) {
        await provider.registerApp(session.webId).catch(() => {
          // Ignore: retried on the next interval/visibility change
        });
      }
    };

    // Deliberately not run immediately: `registerApp()` (called from `AntdAuthPage` on every
    // login) already covers the "just landed on the app" case. Firing here too would race with
    // it on every page load, including during the login/consent redirect dance itself.
    setInterval(checkAppStatus, appStatusCheckInterval);
    document.addEventListener('visibilitychange', checkAppStatus);
  }

  return provider;
};

export default authProvider;
