/* eslint-disable no-console */
const crypto = require('crypto');
const fetch = require('node-fetch');
const { SignJWT, exportJWK, generateKeyPair } = require('jose');

const backendBase = (process.env.OAUTH_PROOF_BASE_URL || process.env.SEMAPPS_HOME_URL || 'http://localhost:3000').replace(/\/$/, '');
const sidecarBase = (process.env.OAUTH_PROOF_SIDECAR_BASE_URL || 'http://localhost:8085').replace(/\/$/, '');
const canonicalAccountId = process.env.OAUTH_PROOF_CANONICAL_ACCOUNT_ID;
const clientId = process.env.OAUTH_PROOF_CLIENT_ID;
const redirectUri = process.env.OAUTH_PROOF_REDIRECT_URI;
const scope = process.env.OAUTH_PROOF_SCOPE || 'atproto';
const userToken = process.env.OAUTH_PROOF_USER_TOKEN;
const internalBearer = process.env.OAUTH_PROOF_INTERNAL_BEARER || process.env.ACTIVITYPODS_TOKEN;

function randomBase64Url(size = 32) {
  return crypto.randomBytes(size).toString('base64url');
}

function base64UrlSha256(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('base64url');
}

function firstCookieValue(response, cookieName) {
  const setCookie = response.headers.raw()['set-cookie'] || [];
  for (const cookie of setCookie) {
    const [pair] = String(cookie).split(';');
    const [name, ...rest] = pair.split('=');
    if (String(name).trim() === cookieName) {
      return `${name.trim()}=${rest.join('=').trim()}`;
    }
  }
  return null;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

async function createDpopProof({ privateKey, publicJwk, htm, htu, nonce, accessToken }) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({
    htm,
    htu,
    jti: crypto.randomUUID(),
    nonce,
    ath: accessToken ? base64UrlSha256(accessToken) : undefined
  });

  return jwt
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: publicJwk })
    .setIssuedAt(now)
    .sign(privateKey);
}

async function fetchNonce() {
  const response = await fetch(`${backendBase}/oauth/dpop-nonce`);
  const json = await readJson(response);
  if (!response.ok || !json || !json.nonce) {
    throw new Error(`nonce endpoint failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json.nonce;
}

async function exchangeCodeForToken({ code, codeVerifier, keyPair }) {
  const tokenUrl = `${backendBase}/oauth/token`;
  let nonce;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const dpopProof = await createDpopProof({
      privateKey: keyPair.privateKey,
      publicJwk: keyPair.publicJwk,
      htm: 'POST',
      htu: tokenUrl,
      nonce
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        dpop: dpopProof,
        ...(nonce ? { 'dpop-nonce': nonce } : {})
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
        code_verifier: codeVerifier
      })
    });

    const json = await readJson(response);
    if (response.ok) {
      return json;
    }

    const challengeNonce = response.headers.get('dpop-nonce');
    if (response.status === 401 && challengeNonce && attempt < 2) {
      nonce = challengeNonce;
      continue;
    }

    throw new Error(`token exchange failed: ${response.status} ${JSON.stringify(json)}`);
  }

  throw new Error('token exchange failed after nonce retry');
}

async function callSidecarWrite({ accessToken, did, keyPair }) {
  const writePath = '/xrpc/com.atproto.repo.createRecord';
  const writeUrl = `${sidecarBase}${writePath}`;
  let nonce;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const dpopProof = await createDpopProof({
      privateKey: keyPair.privateKey,
      publicJwk: keyPair.publicJwk,
      htm: 'POST',
      htu: writeUrl,
      nonce,
      accessToken
    });

    const response = await fetch(writeUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        dpop: dpopProof,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        repo: did,
        collection: 'app.bsky.feed.post',
        record: {
          text: 'OAuth backend-to-sidecar bridge proof',
          createdAt: new Date().toISOString()
        }
      })
    });

    const json = await readJson(response);
    const challengeNonce = response.headers.get('dpop-nonce');
    if (response.status === 401 && challengeNonce && attempt < 2) {
      nonce = challengeNonce;
      continue;
    }

    return {
      status: response.status,
      body: json
    };
  }

  return {
    status: 401,
    body: { error: 'AuthRequired', message: 'nonce challenge unresolved' }
  };
}

async function main() {
  if (!canonicalAccountId || !clientId || !redirectUri) {
    throw new Error('Missing required env vars: OAUTH_PROOF_CANONICAL_ACCOUNT_ID, OAUTH_PROOF_CLIENT_ID, OAUTH_PROOF_REDIRECT_URI');
  }

  const useInternalAuthorize = !userToken;
  if (useInternalAuthorize && !internalBearer) {
    throw new Error('Internal authorize fallback requires OAUTH_PROOF_INTERNAL_BEARER (or ACTIVITYPODS_TOKEN)');
  }

  const codeVerifier = randomBase64Url(48);
  const codeChallenge = base64UrlSha256(codeVerifier);
  const state = randomBase64Url(16);
  const keyPair = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = await exportJWK(keyPair.publicKey);
  keyPair.publicJwk = publicJwk;

  const parNonce = await fetchNonce();
  const parDpop = await createDpopProof({
    privateKey: keyPair.privateKey,
    publicJwk,
    htm: 'POST',
    htu: `${backendBase}/oauth/par`,
    nonce: parNonce
  });

  const parResponse = await fetch(`${backendBase}/oauth/par`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      dpop: parDpop,
      'dpop-nonce': parNonce
    },
    body: JSON.stringify({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    })
  });

  const parJson = await readJson(parResponse);
  if (!parResponse.ok || !parJson || !parJson.request_uri) {
    throw new Error(`PAR failed: ${parResponse.status} ${JSON.stringify(parJson)}`);
  }

  const authorizeGet = await fetch(`${backendBase}/oauth/authorize?request_uri=${encodeURIComponent(parJson.request_uri)}`);
  const authorizeContext = await readJson(authorizeGet);
  if (!authorizeGet.ok || !authorizeContext || !authorizeContext.consent_challenge) {
    throw new Error(`authorize context failed: ${authorizeGet.status} ${JSON.stringify(authorizeContext)}`);
  }

  const csrfCookie = firstCookieValue(authorizeGet, 'oauth_csrf');
  if (!csrfCookie) {
    throw new Error('authorize context did not issue oauth_csrf cookie');
  }

  const authorizePostUrl = useInternalAuthorize
    ? `${backendBase}/api/internal/oauth/authorize`
    : `${backendBase}/oauth/authorize`;

  const authorizePost = await fetch(authorizePostUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: csrfCookie,
      ...(useInternalAuthorize
        ? { authorization: `Bearer ${internalBearer}` }
        : { authorization: `Bearer ${userToken}` })
    },
    redirect: 'manual',
    body: JSON.stringify({
      request_uri: parJson.request_uri,
      decision: 'approve',
      consent_challenge: authorizeContext.consent_challenge,
      ...(useInternalAuthorize ? { canonicalAccountId } : {})
    })
  });

  const authorizeJson = await readJson(authorizePost);
  const redirectLocation = (authorizeJson && authorizeJson.redirect) || authorizePost.headers.get('location');
  if (authorizePost.status !== 302 || !redirectLocation) {
    throw new Error(`authorize failed: ${authorizePost.status} ${JSON.stringify(authorizeJson)}`);
  }

  const redirect = new URL(redirectLocation);
  const code = redirect.searchParams.get('code');
  if (!code) {
    throw new Error('authorization redirect did not include code');
  }
  if (redirect.searchParams.get('state') !== state) {
    throw new Error('authorization state mismatch');
  }

  const tokenJson = await exchangeCodeForToken({ code, codeVerifier, keyPair });
  if (!tokenJson || !tokenJson.access_token || !tokenJson.sub) {
    throw new Error('token response missing required fields');
  }

  const writeResult = await callSidecarWrite({
    accessToken: tokenJson.access_token,
    did: tokenJson.sub,
    keyPair
  });

  const summary = {
    token_sub: tokenJson.sub,
    token_scope: tokenJson.scope,
    write_status: writeResult.status,
    write_body: writeResult.body
  };

  if (writeResult.status === 401) {
    console.error('[proof-oauth-backend-sidecar-bridge] FAIL');
    console.error(JSON.stringify(summary, null, 2));
    process.exit(2);
  }

  console.log('[proof-oauth-backend-sidecar-bridge] PASS');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[proof-oauth-backend-sidecar-bridge] FAIL', error.message);
  process.exit(1);
});
