const { ServiceBroker } = require('moleculer');

describe('unified-account service', () => {
  let broker;
  let accountCreateCalls = 0;
  const approvedApp = {
    clientId: 'https://memory.example/app',
    bearerTokens: ['memory-signup-token'],
    verificationTokens: ['verified-user-token'],
    allowedOrigins: ['https://memory.example'],
    allowAtproto: true,
    maxAccountsPerDay: 100
  };
  const limitedApp = {
    clientId: 'https://limited.example/app',
    bearerTokens: ['limited-signup-token'],
    verificationTokens: ['limited-user-token'],
    allowedOrigins: ['https://limited.example'],
    allowAtproto: true,
    maxAccountsPerDay: 1
  };

  const createPayload = {
    username: 'alice',
    email: 'alice@example.com',
    password: 'Phase7LivePass123',
    profile: {
      displayName: 'Alice',
      summary: 'Unified test account'
    },
    solid: { enabled: true },
    activitypub: { enabled: true },
    atproto: { enabled: true, didMethod: 'plc' }
  };

  async function authorizeProvisioning(payload = createPayload) {
    return broker.call('provider-capabilities.authorizeAccountProvisioning', {
      appClientId: approvedApp.clientId,
      authorization: 'Bearer memory-signup-token',
      origin: 'https://memory.example',
      username: payload.username,
      email: payload.email,
      requestedProtocols: {
        solid: payload.solid?.enabled !== false,
        activitypub: payload.activitypub?.enabled !== false,
        atproto: payload.atproto?.enabled === true
      },
      verification: {
        method: 'email',
        challengeToken: 'verified-user-token'
      }
    });
  }

  beforeAll(async () => {
    broker = new ServiceBroker({ logger: false });

    broker.createService({
      name: 'api',
      actions: {
        addRoute: async () => true
      }
    });

    const providerCapabilitiesService = require('../services/provider-capabilities.service');
    broker.createService({
      ...providerCapabilitiesService,
      settings: {
        ...providerCapabilitiesService.settings,
        accountProvisioningEnabled: true,
        atprotoEnabled: true,
        approvedApps: [approvedApp, limitedApp],
        requiresApprovedApps: true,
        requiresUserVerification: true,
        requireBearerToken: true
      }
    });

    broker.createService({
      name: 'account-provisioning-state',
      actions: {
        begin: async () => ({ provisioningId: 'prov-1' }),
        markPhase: async () => true,
        finalize: async () => true
      }
    });

    broker.createService({
      name: 'accounts',
      actions: {
        create: async ctx => {
          accountCreateCalls += 1;
          return {
            canonicalAccountId: 'http://localhost:3000/alice/profile/card#me',
            username: ctx.params.username,
            email: ctx.params.email,
            createdAt: new Date().toISOString(),
            status: 'active'
          };
        }
      }
    });

    broker.createService({
      name: 'webid-provisioning',
      actions: {
        create: async () => ({
          webId: 'http://localhost:3000/alice/profile/card#me',
          podBaseUrl: 'http://localhost:3000/alice/'
        })
      }
    });

    broker.createService({
      name: 'activitypub-provisioning',
      actions: {
        provisionForAccount: async () => ({
          actorId: 'http://localhost:3000/alice',
          handle: '@alice@localhost',
          inbox: 'http://localhost:3000/alice/inbox',
          outbox: 'http://localhost:3000/alice/outbox'
        })
      }
    });

    broker.createService({
      name: 'keys',
      actions: {
        generateSecp256k1Key: async () => ({
          keyRef: `key:${Math.random().toString(36).slice(2)}`,
          publicKeyMultibase: `zMock${Math.random().toString(36).slice(2)}`
        })
      }
    });

    const bindingStore = {};

    broker.createService({
      name: 'identitybindings',
      actions: {
        getByCanonicalAccountId: async ctx => bindingStore[ctx.params.canonicalAccountId] || null,
        upsert: async ctx => {
          const now = new Date().toISOString();
          const rec = {
            id: `binding:${ctx.params.canonicalAccountId}`,
            canonicalAccountId: ctx.params.canonicalAccountId,
            webId: ctx.params.webId,
            atprotoDid: ctx.params.atprotoDid,
            atprotoHandle: ctx.params.atprotoHandle,
            atSigningKeyRef: ctx.params.atSigningKeyRef,
            atRotationKeyRef: ctx.params.atRotationKeyRef,
            status: ctx.params.status,
            createdAt: bindingStore[ctx.params.canonicalAccountId]?.createdAt || now,
            updatedAt: now
          };
          bindingStore[ctx.params.canonicalAccountId] = rec;
          return rec;
        },
        upsertRepoBootstrap: async ctx => {
          const existing = bindingStore[ctx.params.canonicalAccountId];
          if (!existing) throw new Error('IDENTITY_BINDING_NOT_FOUND');
          const updated = {
            ...existing,
            repoInitialized: ctx.params.repoInitialized,
            repoRootCid: ctx.params.rootCid,
            repoRev: ctx.params.rev
          };
          bindingStore[ctx.params.canonicalAccountId] = updated;
          return updated;
        }
      }
    });

    broker.createService({
      name: 'signing',
      actions: {
        getAtprotoPublicKey: async ctx => ({
          canonicalAccountId: ctx.params.canonicalAccountId,
          purpose: ctx.params.purpose,
          publicKeyMultibase: `zMockPublicKey-${ctx.params.purpose}`
        })
      }
    });

    broker.createService(require('../services/core/atproto-provisioning'));
    broker.createService(require('../services/unified-account.service'));
    broker.createService(require('../services/unified-account-api.service'));

    await broker.start();
  });

  afterAll(async () => {
    await broker.stop();
  });

  test('creates one unified account usable for Solid, ActivityPub, and ATProto', async () => {
    const provisioningGrant = await authorizeProvisioning();
    const result = await broker.call('unified-account.create', createPayload, {
      meta: { accountProvisioning: provisioningGrant }
    });

    expect(result).toBeDefined();
    expect(result.canonicalAccountId).toBe('http://localhost:3000/alice/profile/card#me');
    expect(result.webId).toBe('http://localhost:3000/alice/profile/card#me');

    expect(result.solid).toEqual({
      webId: 'http://localhost:3000/alice/profile/card#me',
      podBaseUrl: 'http://localhost:3000/alice/'
    });

    expect(result.activitypub.actorId).toBe('http://localhost:3000/alice');
    expect(result.activitypub.handle).toBe('@alice@localhost');

    expect(result.atproto.did.startsWith('did:plc:')).toBe(true);
    expect(result.atproto.handle.endsWith('.test')).toBe(true);
    expect(result.atproto.repoInitialized).toBe(true);

    expect(result.provisioning.state).toBe('completed');
  });

  test('rejects orchestrator calls without an account provisioning grant', async () => {
    await expect(broker.call('unified-account.create', createPayload)).rejects.toMatchObject({
      code: 403,
      type: 'unauthorized_app'
    });
  });

  test('rejects public signup from an unapproved app before orchestration starts', async () => {
    await expect(
      broker.call('unified-account-api.create', {
        ...createPayload,
        appClientId: 'https://unknown.example/app',
        verification: {
          method: 'email',
          challengeToken: 'verified-user-token'
        }
      })
    ).rejects.toMatchObject({
      code: 403,
      type: 'unauthorized_app'
    });
  });

  test('rejects approved app signup without an Idempotency-Key', async () => {
    await expect(
      broker.call(
        'unified-account-api.create',
        {
          ...createPayload,
          username: 'alice-missing-key',
          email: 'alice-missing-key@example.com',
          appClientId: approvedApp.clientId,
          verification: {
            method: 'email',
            challengeToken: 'verified-user-token'
          }
        },
        {
          meta: {
            $headers: {
              authorization: 'Bearer memory-signup-token',
              origin: 'https://memory.example'
            }
          }
        }
      )
    ).rejects.toMatchObject({
      code: 400,
      type: 'idempotency_key_required'
    });
  });

  test('public signup accepts an approved app and provider verification', async () => {
    const result = await broker.call(
      'unified-account-api.create',
      {
        ...createPayload,
        username: 'alice-api',
        email: 'alice-api@example.com',
        appClientId: approvedApp.clientId,
        verification: {
          method: 'email',
          challengeToken: 'verified-user-token'
        },
        protocols: {
          solid: true,
          activitypub: true,
          atproto: {
            enabled: true,
            didMethod: 'did:plc'
          }
        }
      },
      {
        meta: {
          $headers: {
            authorization: 'Bearer memory-signup-token',
            origin: 'https://memory.example',
            'idempotency-key': 'signup-proof-1'
          }
        }
      }
    );

    expect(result.canonicalAccountId).toBe('http://localhost:3000/alice/profile/card#me');
    expect(result.atproto.repoInitialized).toBe(true);
  });

  test('replays completed account creation for the same Idempotency-Key', async () => {
    const before = accountCreateCalls;
    const payload = {
      ...createPayload,
      username: 'alice-replay',
      email: 'alice-replay@example.com',
      appClientId: approvedApp.clientId,
      verification: {
        method: 'email',
        challengeToken: 'verified-user-token'
      }
    };
    const options = {
      meta: {
        $headers: {
          authorization: 'Bearer memory-signup-token',
          origin: 'https://memory.example',
          'idempotency-key': 'signup-replay-1'
        }
      }
    };

    const first = await broker.call('unified-account-api.create', payload, options);
    const second = await broker.call('unified-account-api.create', payload, options);

    expect(second).toEqual(first);
    expect(accountCreateCalls - before).toBe(1);
  });

  test('rejects reused Idempotency-Key with a different request payload', async () => {
    const options = {
      meta: {
        $headers: {
          authorization: 'Bearer memory-signup-token',
          origin: 'https://memory.example',
          'idempotency-key': 'signup-conflict-1'
        }
      }
    };

    await broker.call(
      'unified-account-api.create',
      {
        ...createPayload,
        username: 'alice-conflict-a',
        email: 'alice-conflict-a@example.com',
        appClientId: approvedApp.clientId,
        verification: {
          method: 'email',
          challengeToken: 'verified-user-token'
        }
      },
      options
    );

    await expect(
      broker.call(
        'unified-account-api.create',
        {
          ...createPayload,
          username: 'alice-conflict-b',
          email: 'alice-conflict-b@example.com',
          appClientId: approvedApp.clientId,
          verification: {
            method: 'email',
            challengeToken: 'verified-user-token'
          }
        },
        options
      )
    ).rejects.toMatchObject({
      code: 409,
      type: 'idempotency_key_conflict'
    });
  });

  test('enforces approved app daily account provisioning limit', async () => {
    const limitedPayload = {
      ...createPayload,
      username: 'limited-one',
      email: 'limited-one@example.com',
      appClientId: limitedApp.clientId,
      verification: {
        method: 'email',
        challengeToken: 'limited-user-token'
      }
    };

    await broker.call('unified-account-api.create', limitedPayload, {
      meta: {
        $headers: {
          authorization: 'Bearer limited-signup-token',
          origin: 'https://limited.example',
          'idempotency-key': 'limited-signup-1'
        }
      }
    });

    await expect(
      broker.call(
        'unified-account-api.create',
        {
          ...limitedPayload,
          username: 'limited-two',
          email: 'limited-two@example.com'
        },
        {
          meta: {
            $headers: {
              authorization: 'Bearer limited-signup-token',
              origin: 'https://limited.example',
              'idempotency-key': 'limited-signup-2'
            }
          }
        }
      )
    ).rejects.toMatchObject({
      code: 429,
      type: 'limit_exceeded'
    });
  });
});
