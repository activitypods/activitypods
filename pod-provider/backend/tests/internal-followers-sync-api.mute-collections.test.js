const serviceDefinition = require('../services/internal-followers-sync-api.service');

describe('internal-followers-sync-api mute collection projections', () => {
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

  test('getMutedCollection returns normalized muted subjects in order', async () => {
    const service = createService();
    const ctx = {
      params: { actorIdentifier: 'alice' },
      meta: {},
      call: jest.fn(async action => {
        if (action === 'auth.account.findByUsername') {
          return { username: 'alice', webId: 'https://fed.example.com/users/alice' };
        }
        if (action === 'activitypub.actor.get') {
          return {
            id: 'https://fed.example.com/users/alice',
            muted: 'https://fed.example.com/users/alice/muted'
          };
        }
        if (action === 'activitypub.muted.getMutedCollectionSharingState') {
          return {
            public: true,
            followersCollectionUri: 'https://fed.example.com/users/alice/muted/followers'
          };
        }
        if (action === 'triplestore.query') {
          return [
            {
              subjectCanonicalId: { value: 'did:plc:alicefriend' },
              subjectProtocol: { value: 'atproto' },
              createdAt: { value: '2026-04-19T12:00:00Z' }
            },
            {
              subjectCanonicalId: { value: 'https://remote.example/users/noisy' },
              subjectProtocol: { value: 'activitypub' },
              createdAt: { value: '2026-04-18T12:00:00Z' }
            },
            {
              subjectCanonicalId: { value: '@carol@example.net' },
              subjectProtocol: { value: 'activitypub' },
              createdAt: { value: '2026-04-17T12:00:00Z' }
            },
            {
              subjectCanonicalId: { value: 'did:plc:alicefriend' },
              subjectProtocol: { value: 'atproto' },
              createdAt: { value: '2026-04-16T12:00:00Z' }
            }
          ];
        }
        throw new Error(`Unexpected action: ${action}`);
      })
    };

    const result = await serviceDefinition.actions.getMutedCollection.handler.call(service, ctx);

    expect(ctx.meta.$statusCode).toBe(200);
    expect(result).toEqual({
      items: [
        {
          type: 'Object',
          subjectCanonicalId: 'did:plc:alicefriend',
          subjectProtocol: 'atproto',
          id: 'did:plc:alicefriend',
          published: '2026-04-19T12:00:00Z'
        },
        {
          type: 'Object',
          subjectCanonicalId: 'https://remote.example/users/noisy',
          subjectProtocol: 'activitypub',
          id: 'https://remote.example/users/noisy',
          published: '2026-04-18T12:00:00Z'
        },
        {
          type: 'Object',
          subjectCanonicalId: '@carol@example.net',
          subjectProtocol: 'activitypub',
          published: '2026-04-17T12:00:00Z'
        }
      ],
      public: true,
      followersCollection: 'https://fed.example.com/users/alice/muted/followers',
      collectionUri: 'https://fed.example.com/users/alice/muted'
    });
  });

  test('getMutedFollowersCollection returns follower URIs only when sharing is enabled', async () => {
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
            muted: 'https://fed.example.com/users/alice/muted'
          };
        }
        if (action === 'activitypub.muted.getMutedCollectionSharingState') {
          return {
            public: true,
            followersCollectionUri: 'https://fed.example.com/users/alice/muted/followers'
          };
        }
        if (action === 'activitypub.collection.get') {
          expect(params).toEqual({
            resourceUri: 'https://fed.example.com/users/alice/muted/followers',
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

    const result = await serviceDefinition.actions.getMutedFollowersCollection.handler.call(service, ctx);

    expect(ctx.meta.$statusCode).toBe(200);
    expect(result).toEqual({
      items: [
        'https://remote.example/users/moderator',
        'https://remote.example/users/ally'
      ],
      public: true,
      followersCollection: 'https://fed.example.com/users/alice/muted/followers'
    });
  });
});
