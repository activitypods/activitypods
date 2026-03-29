/* eslint-disable no-console */
const fetch = require('node-fetch');

const baseUrl = process.env.OAUTH_PROOF_BASE_URL || process.env.SEMAPPS_HOME_URL || 'http://localhost:3000';

async function main() {
  const asUrl = `${baseUrl}/.well-known/oauth-authorization-server`;
  const rsUrl = `${baseUrl}/.well-known/oauth-protected-resource`;

  const [asRes, rsRes] = await Promise.all([fetch(asUrl), fetch(rsUrl)]);

  const asJson = await asRes.json();
  const rsJson = await rsRes.json();

  if (!asRes.ok) {
    throw new Error(`authorization metadata failed: ${asRes.status} ${JSON.stringify(asJson)}`);
  }
  if (!rsRes.ok) {
    throw new Error(`protected-resource metadata failed: ${rsRes.status} ${JSON.stringify(rsJson)}`);
  }

  const requiredAs = [
    'issuer',
    'authorization_endpoint',
    'token_endpoint',
    'pushed_authorization_request_endpoint',
    'dpop_signing_alg_values_supported',
    'code_challenge_methods_supported'
  ];

  for (const key of requiredAs) {
    if (!(key in asJson)) {
      throw new Error(`authorization metadata missing ${key}`);
    }
  }

  if (!Array.isArray(rsJson.authorization_servers) || rsJson.authorization_servers.length === 0) {
    throw new Error('protected-resource metadata missing authorization_servers');
  }

  console.log('[proof-oauth-metadata] PASS');
  console.log(JSON.stringify({
    authorizationServer: asJson.issuer,
    protectedResource: rsJson.resource
  }, null, 2));
}

main().catch((error) => {
  console.error('[proof-oauth-metadata] FAIL', error.message);
  process.exit(1);
});
