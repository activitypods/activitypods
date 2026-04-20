const serviceDefinition = require('../services/internal-followers-sync-api.service');

describe('internal-followers-sync-api block collection projections', () => {
  function createService(overrides = {}) {
    return {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      },
      ...serviceDefinition.methods,
      ...overrides
    };
  }

  test('getBlockedCollection returns unique blocked actor URIs in order', async () => {
    const service = createService();
    const ctx = {
      params: { actorIdentifier: 'alice' },
      meta: {},
      call: jest.fn(async (action, params) => {
        if (action === 'auth.account.findByUsername') {
          return { username: 'alice', webId: 'https://fed.example.com/users/alice' };
        }
        if (action === 'activitypub.actor.get') {
          return {
            id: 'https://fed.example.com/users/alice',
            blocked: 'https://fed.example.com/users/alice/blocked'
          };
        }
        if (action === 'activitypub.blocked.getBlockedCollectionSharingState') {
          return {
            public: true,
            followersCollectionUri: 'https://fed.example.com/users/alice/blocked/followers'
          };
        }
        if (action === 'activitypub.collection.get') {
          expect(params).toEqual({
            resourceUri: 'https://fed.example.com/users/alice/blocked',
            webId: 'system'
          });
          return {
            orderedItems: [
              {
                id: 'https://fed.example.com/activities/block-2',
                type: 'Block',
                object: { id: 'https://remote.example/users/spammer', type: 'Person', name: 'Spammer' },
                published: '2026-04-19T12:00:00Z'
              },
              {
                id: 'https://fed.example.com/activities/block-1',
                type: 'Block',
                object: 'https://remote.example/users/noisy',
                published: '2026-04-18T12:00:00Z'
              },
              {
                id: 'https://fed.example.com/activities/block-0',
                type: 'Block',
                object: { id: 'https://remote.example/users/spammer' },
                published: '2026-04-17T12:00:00Z'
              }
            ]
          };
        }
        throw new Error(`Unexpected action: ${action}`);
      })
    };

    const result = await serviceDefinition.actions.getBlockedCollection.handler.call(service, ctx);

    expect(ctx.meta.$statusCode).toBe(200);
    expect(result).toEqual({
      items: [
        'https://remote.example/users/spammer',
        'https://remote.example/users/noisy'
      ],
      public: true,
      followersCollection: 'https://fed.example.com/users/alice/blocked/followers'
    });
  });

  test('getBlocksCollection prefers blocks and falls back to blocked data', async () => {
    const service = createService();
    const ctx = {
      params: { actorIdentifier: 'alice' },
      meta: {},
      call: jest.fn(async (action, params) => {
        if (action === 'auth.account.findByUsername') {
          return { username: 'alice', webId: 'https://fed.example.com/users/alice' };
        }
        if (action === 'activitypub.actor.get') {
          return {
            id: 'https://fed.example.com/users/alice',
            blocked: 'https://fed.example.com/users/alice/blocked'
          };
        }
        if (action === 'activitypub.blocked.getBlockedCollectionSharingState') {
          return {
            public: false,
            followersCollectionUri: null
          };
        }
        if (action === 'activitypub.collection.get') {
          expect(params).toEqual({
            resourceUri: 'https://fed.example.com/users/alice/blocked',
            webId: 'system'
          });
          return {
            orderedItems: [
              {
                id: 'https://fed.example.com/activities/block-2',
                type: ['custom:Disallow', 'Block'],
                object: {
                  id: 'https://remote.example/users/spammer',
                  type: 'Person',
                  name: 'Spammer',
                  summary: 'drop me'
                },
                published: '2026-04-19T12:00:00Z'
              },
              {
                id: 'https://fed.example.com/activities/ignore-me',
                type: 'Create',
                object: 'https://remote.example/notes/1'
              }
            ]
          };
        }
        throw new Error(`Unexpected action: ${action}`);
      })
    };

    const result = await serviceDefinition.actions.getBlocksCollection.handler.call(service, ctx);

    expect(ctx.meta.$statusCode).toBe(200);
    expect(result).toEqual({
      items: [
        {
          id: 'https://fed.example.com/activities/block-2',
          type: ['custom:Disallow', 'Block'],
          object: {
            id: 'https://remote.example/users/spammer',
            type: 'Person',
            name: 'Spammer'
          },
          published: '2026-04-19T12:00:00Z'
        }
      ]
    });
  });

  test('getBlockedFollowersCollection returns follower URIs only when sharing is enabled', async () => {
    const service = createService();
    const ctx = {
      params: { actorIdentifier: 'alice' },
      meta: {},
      call: jest.fn(async (action, params) => {
        if (action === 'auth.account.findByUsername') {
          return { username: 'alice', webId: 'https://fed.example.com/users/alice' };
        }
        if (action === 'activitypub.actor.get') {
          return {
            id: 'https://fed.example.com/users/alice',
            blocked: 'https://fed.example.com/users/alice/blocked'
          };
        }
        if (action === 'activitypub.blocked.getBlockedCollectionSharingState') {
          return {
            public: true,
            followersCollectionUri: 'https://fed.example.com/users/alice/blocked/followers'
          };
        }
        if (action === 'activitypub.collection.get') {
          expect(params).toEqual({
            resourceUri: 'https://fed.example.com/users/alice/blocked/followers',
            webId: 'system'
          });
          return {
            items: [
              'https://remote.example/users/moderator',
              { id: 'https://remote.example/users/ally' },
              'https://remote.example/users/moderator'
            ]
          };
        }
        throw new Error(`Unexpected action: ${action}`);
      })
    };

    const result = await serviceDefinition.actions.getBlockedFollowersCollection.handler.call(service, ctx);

    expect(ctx.meta.$statusCode).toBe(200);
    expect(result).toEqual({
      items: [
        'https://remote.example/users/moderator',
        'https://remote.example/users/ally'
      ],
      public: true,
      followersCollection: 'https://fed.example.com/users/alice/blocked/followers'
    });
  });
});
