const serviceDefinition = require('../services/blocked-collection-sharing-api.service');

describe('blocked-collection-sharing-api service', () => {
  function createService(overrides = {}) {
    return {
      ...serviceDefinition.methods,
      ...overrides
    };
  }

  test('getVisibility returns the current public state for the authenticated actor', async () => {
    const service = createService();
    const ctx = {
      meta: { webId: 'https://fed.example.com/users/alice' },
      call: jest.fn(async action => {
        if (action === 'activitypub.blocked.getBlockedCollectionSharingState') {
          return {
            public: true,
            collectionUri: 'https://fed.example.com/users/alice/blocked',
            followersCollectionUri: 'https://fed.example.com/users/alice/blocked/followers'
          };
        }
        throw new Error(`Unexpected action: ${action}`);
      })
    };

    const result = await serviceDefinition.actions.getVisibility.handler.call(service, ctx);

    expect(result).toEqual({
      public: true,
      collectionUri: 'https://fed.example.com/users/alice/blocked',
      followersCollectionUri: 'https://fed.example.com/users/alice/blocked/followers'
    });
  });

  test('setVisibility updates the public state for the authenticated actor', async () => {
    const service = createService();
    const ctx = {
      params: { public: true },
      meta: { webId: 'https://fed.example.com/users/alice' },
      call: jest.fn(async (action, params) => {
        if (action === 'activitypub.blocked.setBlockedCollectionPublic') {
          expect(params).toEqual({
            actorUri: 'https://fed.example.com/users/alice',
            isPublic: true
          });
          return {
            public: true,
            collectionUri: 'https://fed.example.com/users/alice/blocked',
            followersCollectionUri: 'https://fed.example.com/users/alice/blocked/followers'
          };
        }
        throw new Error(`Unexpected action: ${action}`);
      })
    };

    const result = await serviceDefinition.actions.setVisibility.handler.call(service, ctx);

    expect(ctx.meta.$statusCode).toBe(200);
    expect(result).toEqual({
      public: true,
      collectionUri: 'https://fed.example.com/users/alice/blocked',
      followersCollectionUri: 'https://fed.example.com/users/alice/blocked/followers'
    });
  });
});
