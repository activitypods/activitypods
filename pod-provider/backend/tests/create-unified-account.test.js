const { ServiceBroker } = require('moleculer');

describe('unified-account service', () => {
  let broker;

  beforeAll(async () => {
    broker = new ServiceBroker({ logger: false });

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
        create: async ctx => ({
          canonicalAccountId: 'http://localhost:3000/alice/profile/card#me',
          username: ctx.params.username,
          email: ctx.params.email,
          createdAt: new Date().toISOString(),
          status: 'active'
        })
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

    await broker.start();
  });

  afterAll(async () => {
    await broker.stop();
  });

  test('creates one unified account usable for Solid, ActivityPub, and ATProto', async () => {
    const result = await broker.call('unified-account.create', {
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
});
