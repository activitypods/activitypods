/* eslint-disable no-console */
const crypto = require('crypto');
const fetch = require('node-fetch');

const baseUrl = process.env.OAUTH_PROOF_BASE_URL || process.env.SEMAPPS_HOME_URL || 'http://localhost:3000';
const clientId = process.env.OAUTH_PROOF_CLIENT_ID || 'https://app.example.com/oauth/memory-pwa.client.json';
const redirectUri = process.env.OAUTH_PROOF_REDIRECT_URI || 'https://app.example.com/oauth/callback';

function randomVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function challengeFromVerifier(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

async function main() {
  const nonceRes = await fetch(`${baseUrl}/oauth/dpop-nonce`);
  const nonceJson = await nonceRes.json();
  if (!nonceRes.ok) {
    throw new Error(`nonce request failed: ${nonceRes.status} ${JSON.stringify(nonceJson)}`);
  }

  // This proof script only checks server-side PAR persistence path wiring.
  // It expects caller to inject a valid DPoP proof in OAUTH_PROOF_DPOP.
  const dpop = process.env.OAUTH_PROOF_DPOP;
  if (!dpop) {
    throw new Error('Set OAUTH_PROOF_DPOP to a valid DPoP proof JWT to run this proof');
  }

  const verifier = randomVerifier();
  const body = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'atproto transition:generic',
    code_challenge: challengeFromVerifier(verifier),
    code_challenge_method: 'S256',
    state: 'proof-state'
  };

  const parRes = await fetch(`${baseUrl}/oauth/par`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      dpop,
      'dpop-nonce': nonceJson.nonce
    },
    body: JSON.stringify(body)
  });

  const parJson = await parRes.json();
  if (!parRes.ok) {
    throw new Error(`PAR failed: ${parRes.status} ${JSON.stringify(parJson)}`);
  }

  if (!String(parJson.request_uri || '').startsWith('urn:ietf:params:oauth:request_uri:')) {
    throw new Error('PAR response missing valid request_uri');
  }

  console.log('[proof-oauth-par] PASS');
  console.log(JSON.stringify(parJson, null, 2));
}

main().catch((error) => {
  console.error('[proof-oauth-par] FAIL', error.message);
  process.exit(1);
});
