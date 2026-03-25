#!/usr/bin/env node

const baseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3004';
const fusekiBase = process.env.SEMAPPS_SPARQL_ENDPOINT || 'http://localhost:3030/';
const jenaUser = process.env.SEMAPPS_JENA_USER || 'admin';
const jenaPassword = process.env.SEMAPPS_JENA_PASSWORD || 'admin';

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function basicAuth(user, pass) {
  return Buffer.from(`${user}:${pass}`).toString('base64');
}

(async () => {
  if (process.env.SEMAPPS_ALLOW_INSECURE_DATASET_FALLBACK === 'true') {
    throw new Error(
      'Refusing to run: SEMAPPS_ALLOW_INSECURE_DATASET_FALLBACK=true. This proof must run without insecure fallback.'
    );
  }

  const username = `secure${Date.now().toString(36)}`;
  const password = 'Phase7LivePass123';
  const payload = {
    username,
    email: `${username}@example.com`,
    password,
    profile: {
      displayName: `Secure ${username}`
    }
  };

  const createRes = await fetch(`${baseUrl}/api/accounts/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const createBody = await parseJsonSafe(createRes);
  if (!createRes.ok) {
    console.error(
      JSON.stringify(
        {
          step: 'create_account',
          status: createRes.status,
          body: createBody
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const datasetCheck = await fetch(`${fusekiBase.replace(/\/$/, '')}/$/datasets/${encodeURIComponent(username)}`, {
    headers: {
      Authorization: `Basic ${basicAuth(jenaUser, jenaPassword)}`
    }
  });

  if (datasetCheck.status !== 200) {
    const details = await datasetCheck.text();
    console.error(
      JSON.stringify(
        {
          step: 'dataset_exists',
          status: datasetCheck.status,
          details
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const markerQuery = `
    ASK {
      GRAPH <http://semapps.org/webacl> {
        ?s <urn:semapps:bootstrapAt> ?o .
      }
    }
  `;

  const queryRes = await fetch(`${fusekiBase.replace(/\/$/, '')}/${encodeURIComponent(username)}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(jenaUser, jenaPassword)}`,
      'Content-Type': 'application/sparql-query',
      Accept: 'application/sparql-results+json'
    },
    body: markerQuery
  });

  const queryBody = await parseJsonSafe(queryRes);
  if (!queryRes.ok || queryBody.boolean !== true) {
    console.error(
      JSON.stringify(
        {
          step: 'webacl_graph_bootstrap',
          status: queryRes.status,
          body: queryBody
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        createAccount: {
          status: createRes.status,
          canonicalAccountId: createBody.webId || createBody.canonicalAccountId || null,
          username
        },
        datasetProvisioning: {
          exists: true,
          secureGraphBootstrapped: true
        }
      },
      null,
      2
    )
  );
})();
