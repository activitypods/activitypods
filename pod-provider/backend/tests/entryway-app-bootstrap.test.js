const { ServiceBroker } = require('moleculer');

describe('entryway-app-bootstrap-api service', () => {
  let broker;
  let createOrUpdateCalls;

  const approvedApp = {
    appClientId: 'https://memory.example/app',
    appUri: 'https://memory.example/app',
    acceptedAccessNeeds: ['https://memory.example/ns/access-needs#timeline'],
    acceptedSpecialRights: ['apods:ReadInbox', 'apods:ReadOutbox']
  };

  beforeEach(async () => {
    createOrUpdateCalls = [];
    broker = new ServiceBroker({ logger: false });

    broker.createService({
      name: 'api',
      actions: {
        addRoute: async () => true
      }
    });

    broker.createService({
      name: 'app-registrations',
      actions: {
        createOrUpdate: async ctx => {
          createOrUpdateCalls.push(ctx.params);
          return 'http://localhost:3000/alice/data/app-registration-memory';
        }
      }
    });

    broker.createService({
      name: 'access-grants',
      actions: {
        getForApp: async () => [{ id: 'http://localhost:3000/alice/data/grant-memory' }]
      }
    });

    const service = require('../services/entryway-app-bootstrap-api.service');
    broker.createService({
      ...service,
      settings: {
        ...service.settings,
        enabled: true,
        internalBearerToken: 'provider-internal-token',
        approvedApps: [approvedApp]
      }
    });

    await broker.start();
  });

  afterEach(async () => {
    await broker.stop();
  });

  test('registers an approved app and returns only registration/grant metadata', async () => {
    const result = await broker.call('entryway-app-bootstrap-api.bootstrap', bootstrapPayload(), {
      meta: {
        $headers: {
          authorization: 'Bearer provider-internal-token'
        }
      }
    });

    expect(result).toMatchObject({
      appRegistrationUri: 'http://localhost:3000/alice/data/app-registration-memory',
      accessGrantUris: ['http://localhost:3000/alice/data/grant-memory']
    });
    expect(result).toHaveProperty('bootstrappedAt');
    expect(JSON.stringify(result)).not.toContain('provider-internal-token');

    expect(createOrUpdateCalls).toEqual([
      {
        appUri: 'https://memory.example/app',
        podOwner: 'http://localhost:3000/alice/profile/card#me',
        acceptedAccessNeeds: approvedApp.acceptedAccessNeeds,
        acceptedSpecialRights: approvedApp.acceptedSpecialRights
      }
    ]);
  });

  test('rejects missing or invalid internal bearer token', async () => {
    await expect(
      broker.call('entryway-app-bootstrap-api.bootstrap', bootstrapPayload(), {
        meta: { $headers: { authorization: 'Bearer wrong-token' } }
      })
    ).rejects.toMatchObject({
      code: 401,
      type: 'UNAUTHORIZED'
    });
  });

  test('rejects apps that are not approved for bootstrap', async () => {
    await expect(
      broker.call(
        'entryway-app-bootstrap-api.bootstrap',
        {
          ...bootstrapPayload(),
          appClientId: 'https://unknown.example/app'
        },
        {
          meta: { $headers: { authorization: 'Bearer provider-internal-token' } }
        }
      )
    ).rejects.toMatchObject({
      code: 403,
      type: 'UNAUTHORIZED_APP'
    });
  });

  test('rejects mismatched canonicalAccountId and webId for current bootstrap path', async () => {
    await expect(
      broker.call(
        'entryway-app-bootstrap-api.bootstrap',
        {
          ...bootstrapPayload(),
          canonicalAccountId: 'http://localhost:3000/alice/internal-subject'
        },
        {
          meta: { $headers: { authorization: 'Bearer provider-internal-token' } }
        }
      )
    ).rejects.toMatchObject({
      code: 400,
      type: 'IDENTITY_MISMATCH'
    });
  });
});

function bootstrapPayload() {
  return {
    accountId: 'acct_11111111-1111-4111-8111-111111111111',
    canonicalAccountId: 'http://localhost:3000/alice/profile/card#me',
    username: 'alice',
    webId: 'http://localhost:3000/alice/profile/card#me',
    actorId: 'http://localhost:3000/alice',
    podStorageUrl: 'http://localhost:3000/alice/data/',
    providerId: 'default',
    appClientId: 'https://memory.example/app'
  };
}
