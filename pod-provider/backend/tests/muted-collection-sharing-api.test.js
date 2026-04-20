const serviceDefinition = require('../services/muted-collection-sharing-api.service');

describe('muted-collection-sharing-api service', () => {
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
        if (action === 'activitypub.muted.getMutedCollectionSharingState') {
          return {
            public: true,
            collectionUri: 'https://fed.example.com/users/alice/muted',
            followersCollectionUri: 'https://fed.example.com/users/alice/muted/followers'
          };
        }
        throw new Error(`Unexpected action: ${action}`);
      })
    };

    const result = await serviceDefinition.actions.getVisibility.handler.call(service, ctx);

    expect(result).toEqual({
      public: true,
      collectionUri: 'https://fed.example.com/users/alice/muted',
      followersCollectionUri: 'https://fed.example.com/users/alice/muted/followers'
    });
  });

  test('setVisibility updates the public state for the authenticated actor', async () => {
    const service = createService();
    const ctx = {
      params: { public: true },
      meta: { webId: 'https://fed.example.com/users/alice' },
      call: jest.fn(async (action, params) => {
        if (action === 'activitypub.muted.setMutedCollectionPublic') {
          expect(params).toEqual({
            actorUri: 'https://fed.example.com/users/alice',
            isPublic: true
          });
          return {
            public: true,
            collectionUri: 'https://fed.example.com/users/alice/muted',
            followersCollectionUri: 'https://fed.example.com/users/alice/muted/followers'
          };
        }
        throw new Error(`Unexpected action: ${action}`);
      })
    };

    const result = await serviceDefinition.actions.setVisibility.handler.call(service, ctx);

    expect(ctx.meta.$statusCode).toBe(200);
    expect(result).toEqual({
      public: true,
      collectionUri: 'https://fed.example.com/users/alice/muted',
      followersCollectionUri: 'https://fed.example.com/users/alice/muted/followers'
    });
  });
});
