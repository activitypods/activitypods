import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import urlJoin from 'url-join';

const passkeyBaseUrl = urlJoin(CONFIG.BACKEND_URL, 'auth/passkeys');

const defaultHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

const REQUEST_TIMEOUT_MS = 12000;
const RETRY_ATTEMPTS = 2;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const jitterDelayMs = attempt => {
  const cap = Math.min(1600, 250 * 2 ** attempt);
  return Math.floor(Math.random() * cap);
};

const ensureSupported = () => {
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') {
    throw new Error('Passkeys are not supported in this browser.');
  }
};

const ensureToken = token => {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Authentication token is missing. Please sign in again.');
  }
  return token.trim();
};

const ensureCredentialId = credentialId => {
  if (typeof credentialId !== 'string' || credentialId.length === 0 || credentialId.length > 2048) {
    throw new Error('Invalid passkey identifier.');
  }
  return credentialId;
};

const normalizeErrorMessage = error => {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError') return 'Passkey request was cancelled or timed out.';
  if (name === 'InvalidStateError') return 'This passkey is already registered on this account.';
  if (name === 'AbortError') return 'Passkey request timed out. Please try again.';
  if (name === 'SecurityError') return 'Passkey is unavailable in this browser context.';
  return error?.message || 'Passkey request failed.';
};

const shouldRetry = (status, error) => {
  if (status === 408 || status === 425 || status === 429 || status >= 500) return true;
  if (!status && error) {
    const message = String(error.message || '').toLowerCase();
    return message.includes('network') || message.includes('timeout') || message.includes('fetch');
  }
  return false;
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'same-origin',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const requestWithRetry = async (path, options = {}) => {
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(urlJoin(passkeyBaseUrl, path), options);
      if (!response.ok) {
        const error = new Error(`Passkey request failed with status ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status);
      const isLast = attempt === RETRY_ATTEMPTS;
      if (isLast || !shouldRetry(status, error)) throw error;
      await sleep(jitterDelayMs(attempt));
    }
  }

  throw lastError;
};

const readJson = async response => {
  const data = await response.json().catch(() => ({}));
  return data;
};

const authHeaders = token => ({
  ...defaultHeaders,
  Authorization: `Bearer ${ensureToken(token)}`
});

const ensureOptionsPayload = payload => {
  if (!payload || typeof payload !== 'object' || !payload.options || !payload.ticket) {
    throw new Error('Server did not return valid passkey options.');
  }
  return payload;
};

const ensureAuthResult = payload => {
  if (!payload || typeof payload !== 'object' || typeof payload.token !== 'string' || typeof payload.webId !== 'string') {
    throw new Error('Passkey sign-in did not return account credentials.');
  }
  return payload;
};

export const signInWithPasskey = async () => {
  ensureSupported();

  try {
    const optionsResponse = await requestWithRetry('authentication/options', {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({})
    });
    const { options, ticket } = ensureOptionsPayload(await readJson(optionsResponse));
    const response = await startAuthentication({ optionsJSON: options });

    const verifyResponse = await requestWithRetry('authentication/verify', {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ response, ticket })
    });

    return ensureAuthResult(await readJson(verifyResponse));
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
};

export const registerPasskey = async token => {
  ensureSupported();

  try {
    const optionsResponse = await requestWithRetry('registration/options', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({})
    });
    const { options, ticket } = ensureOptionsPayload(await readJson(optionsResponse));
    const response = await startRegistration({ optionsJSON: options });

    const verifyResponse = await requestWithRetry('registration/verify', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ response, ticket })
    });

    return readJson(verifyResponse);
  } catch (error) {
    throw new Error(normalizeErrorMessage(error));
  }
};

export const listPasskeys = async token => {
  const response = await requestWithRetry('credentials', {
    method: 'GET',
    headers: authHeaders(token)
  });
  return readJson(response);
};

export const deletePasskey = async (token, credentialId) => {
  const response = await requestWithRetry(`credentials/${encodeURIComponent(ensureCredentialId(credentialId))}`, {
    method: 'DELETE',
    headers: authHeaders(token)
  });
  return readJson(response);
};
