const { ServiceBroker } = require('moleculer');

describe('internal-identity-projection', () => {
  let broker;

  beforeAll(async () => {
    broker = new ServiceBroker({ logger: false });

    broker.createService({
      name: 'identitybindings',
      actions: {
        getByCanonicalAccountId: async ctx => ({
          canonicalAccountId: ctx.params.canonicalAccountId,
          webId: 'http://localhost:3000/alice/profile/card#me',
          atprotoDid: 'did:plc:alice123',
          atprotoHandle: 'alice.test',
          atSigningKeyRef: 'key:commit',
          atRotationKeyRef: 'key:rotation',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }),
        getByDid: async () => null,
        getByHandle: async () => null
      }
    });

    broker.createService(
      require('../services/internal-identity-projection.service')
    );

    await broker.start();
  });

  afterAll(async () => {
    await broker.stop();
  });

  test('returns normalized DTO by canonicalAccountId', async () => {
    const result = await broker.call(
      'internal-identity-projection.getByCanonicalAccountId',
      { canonicalAccountId: 'acct-1' }
    );

    expect(result.canonicalAccountId).toBe('acct-1');
    expect(result.webId).toBe('http://localhost:3000/alice/profile/card#me');
    expect(result.atprotoDid).toBe('did:plc:alice123');
    expect(result.atprotoHandle).toBe('alice.test');
    expect(result.atSigningKeyRef).toBe('key:commit');
    expect(result.atRotationKeyRef).toBe('key:rotation');
    expect(result.status).toBe('active');
  });
});
