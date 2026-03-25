const fetch = require('node-fetch');
const Redis = require('ioredis');

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (_e) {
    return { raw: text };
  }
}

async function main() {
  const backendBase = process.env.UNIFIED_BACKEND_BASE || 'http://localhost:3000';
  const sidecarBase = process.env.UNIFIED_SIDECAR_BASE || 'http://localhost:8085';
  const redisUrl = process.env.UNIFIED_REDIS_URL || 'redis://localhost:6379';
  const seedRedisIdentity = process.env.UNIFIED_SEED_REDIS !== 'false';

  const username = process.env.UNIFIED_USERNAME || `unified-${Date.now()}`;
  const password = process.env.UNIFIED_PASSWORD || 'Phase7LivePass123';

  const createPayload = {
    username,
    email: `${username}@example.com`,
    password,
    profile: {
      displayName: username,
      summary: 'Unified account live proof'
    },
    solid: { enabled: true },
    activitypub: { enabled: true },
    atproto: { enabled: true, didMethod: 'plc' }
  };

  const createRes = await fetch(`${backendBase}/api/accounts/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload)
  });

  const created = await parseJsonSafe(createRes);
  if (!createRes.ok) {
    console.error(JSON.stringify({ step: 'createUnifiedAccount', status: createRes.status, body: created }, null, 2));
    process.exit(1);
  }

  if (seedRedisIdentity && created?.webId && created?.atproto?.did && created?.atproto?.handle) {
    const canonical = created.webId;
    const did = created.atproto.did;
    const handle = created.atproto.handle.toLowerCase();
    const didMethod = did.startsWith('did:web:') ? 'did:web' : 'did:plc';
    const now = new Date().toISOString();

    const binding = {
      canonicalAccountId: canonical,
      contextId: 'default',
      webId: canonical,
      activityPubActorUri: canonical,
      atprotoDid: did,
      atprotoHandle: handle,
      canonicalDidMethod: didMethod,
      atprotoPdsEndpoint: sidecarBase,
      apSigningKeyRef: null,
      atSigningKeyRef: null,
      atRotationKeyRef: null,
      plc: didMethod === 'did:plc'
        ? {
            opCid: null,
            rotationKeyRef: null,
            plcUpdateState: null,
            lastSubmittedAt: null,
            lastConfirmedAt: null,
            lastError: null
          }
        : null,
      didWeb: didMethod === 'did:web'
        ? {
            hostname: null,
            documentPath: null,
            lastRenderedAt: null
          }
        : null,
      accountLinks: {
        apAlsoKnownAs: [],
        atAlsoKnownAs: [],
        relMe: [],
        webIdSameAs: [],
        webIdAccounts: []
      },
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    const redis = new Redis(redisUrl);
    try {
      await redis.set(`identity:binding:${canonical}`, JSON.stringify(binding));
      await redis.sadd('identity:all', canonical);
      await redis.set(`identity:idx:did:${did}`, canonical);
      await redis.set(`identity:idx:handle:${handle}`, canonical);
      await redis.set(`identity:idx:actor:${canonical}`, canonical);
      await redis.set(`identity:idx:webid:${canonical}`, canonical);
    } finally {
      await redis.quit();
    }
  }

  const identifier = created?.atproto?.did || created?.webId;

  const sessionRes = await fetch(`${sidecarBase}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });

  const session = await parseJsonSafe(sessionRes);
  if (!sessionRes.ok) {
    console.error(
      JSON.stringify(
        {
          step: 'createSession',
          status: sessionRes.status,
          body: session,
          account: {
            canonicalAccountId: created?.canonicalAccountId,
            webId: created?.webId,
            atproto: created?.atproto || null
          }
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const accessJwt = session.accessJwt;
  const did = session.did;

  const postRes = await fetch(`${sidecarBase}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessJwt}`
    },
    body: JSON.stringify({
      repo: did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text: `Unified account proof ${Date.now()}`,
        createdAt: new Date().toISOString()
      }
    })
  });

  const post = await parseJsonSafe(postRes);
  if (!postRes.ok) {
    console.error(JSON.stringify({ step: 'createRecord', status: postRes.status, body: post }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        createUnifiedAccount: {
          status: createRes.status,
          canonicalAccountId: created.canonicalAccountId,
          webId: created.webId,
          atproto: created.atproto
        },
        createSession: {
          status: sessionRes.status,
          did: session.did,
          handle: session.handle
        },
        createRecord: {
          status: postRes.status,
          uri: post.uri,
          cid: post.cid
        }
      },
      null,
      2
    )
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
