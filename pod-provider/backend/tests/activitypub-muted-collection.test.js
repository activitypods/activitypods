jest.mock('@semapps/activitypub', () => ({
  ActivitiesHandlerMixin: {},
  ACTIVITY_TYPES: {
    FOLLOW: 'Follow',
    UNDO: 'Undo',
    ACCEPT: 'Accept'
  },
  ACTOR_TYPES: {
    PERSON: 'Person',
    APPLICATION: 'Application'
  }
}));

const serviceDefinition = require('../services/activitypub-muted-collection.service');

describe('activitypub-muted-collection service', () => {
  function createService(overrides = {}) {
    return {
      settings: serviceDefinition.settings,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      },
      broker: {
        call: jest.fn(),
        getLocalService: jest.fn(() => ({ processors: [] }))
      },
      ...serviceDefinition.methods,
      ...overrides
    };
  }

  test('started registers and backfills muted collections', async () => {
    const broker = {
      call: jest.fn(async action => {
        if (action === 'auth.account.find') {
          return [{ webId: 'https://fed.example.com/users/alice' }];
        }
        if (action === 'activitypub.actor.get') {
          return {
            muted: 'https://fed.example.com/users/alice/muted'
          };
        }
        if (action === 'triplestore.query') {
          return [];
        }
        return undefined;
      }),
      getLocalService: jest.fn(() => ({ processors: [] }))
    };
    const service = createService({ broker });

    await serviceDefinition.started.call(service);

    expect(broker.call).toHaveBeenCalledWith(
      'activitypub.collections-registry.register',
      service.settings.mutedCollectionOptions
    );
    expect(broker.call).toHaveBeenCalledWith('activitypub.collections-registry.createAndAttachCollection', {
      objectUri: 'https://fed.example.com/users/alice',
      collection: service.settings.mutedCollectionOptions
    });
    expect(broker.getLocalService).toHaveBeenCalledWith('activitypub.side-effects');
  });

  test('setMutedCollectionPublicState enables public read and attaches followers collection', async () => {
    const service = createService({
      ensureCollectionsForActor: jest.fn(),
      resolveMutedCollectionUri: jest.fn(async () => 'https://fed.example.com/users/alice/muted'),
      ensureMutedFollowersCollection: jest.fn(async () => 'https://fed.example.com/users/alice/muted/followers'),
      detachMutedFollowersCollection: jest.fn(),
      setMutedCollectionPublicFlag: jest.fn(),
      ensurePublicReadOnMutedCollection: jest.fn(),
      getMutedCollectionSharingStateByCollectionUri: jest.fn(async () => ({
        collectionUri: 'https://fed.example.com/users/alice/muted',
        public: true,
        followersCollectionUri: 'https://fed.example.com/users/alice/muted/followers'
      }))
    });

    const ctx = { call: jest.fn() };
    const result = await service.setMutedCollectionPublicState(ctx, 'https://fed.example.com/users/alice', true);

    expect(service.ensureCollectionsForActor).toHaveBeenCalledWith(ctx, 'https://fed.example.com/users/alice');
    expect(service.ensureMutedFollowersCollection).toHaveBeenCalledWith(
      ctx,
      'https://fed.example.com/users/alice/muted',
      'https://fed.example.com/users/alice'
    );
    expect(service.setMutedCollectionPublicFlag).toHaveBeenCalledWith(
      ctx,
      'https://fed.example.com/users/alice/muted',
      true
    );
    expect(service.ensurePublicReadOnMutedCollection).toHaveBeenCalledWith(
      ctx,
      'https://fed.example.com/users/alice/muted',
      'https://fed.example.com/users/alice',
      true
    );
    expect(result).toEqual({
      collectionUri: 'https://fed.example.com/users/alice/muted',
      public: true,
      followersCollectionUri: 'https://fed.example.com/users/alice/muted/followers'
    });
  });

  test('followMutedCollection stores the follower and emits Accept when the list is public', async () => {
    const service = createService({
      extractFollowTargetCollectionUri: jest.fn(() => 'https://fed.example.com/users/alice/muted'),
      getMutedCollectionOwnerUri: jest.fn(() => 'https://fed.example.com/users/alice'),
      getMutedCollectionSharingStateByCollectionUri: jest.fn(async () => ({
        collectionUri: 'https://fed.example.com/users/alice/muted',
        public: true,
        followersCollectionUri: 'https://fed.example.com/users/alice/muted/followers'
      })),
      ensureMutedFollowersCollection: jest.fn(async () => 'https://fed.example.com/users/alice/muted/followers')
    });

    const ctx = {
      call: jest.fn(async action => {
        if (action === 'activitypub.actor.get') {
          return {
            outbox: 'https://fed.example.com/users/alice/outbox'
          };
        }
        return undefined;
      })
    };

    await serviceDefinition.activities.followMutedCollection.onReceive.call(
      service,
      ctx,
      {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: 'https://remote.example/activities/follow-1',
        type: 'Follow',
        actor: 'https://remote.example/users/bob',
        object: 'https://fed.example.com/users/alice/muted'
      },
      'https://fed.example.com/users/alice'
    );

    expect(ctx.call).toHaveBeenCalledWith('activitypub.collection.add', {
      collectionUri: 'https://fed.example.com/users/alice/muted/followers',
      item: 'https://remote.example/users/bob'
    });
    expect(ctx.call).toHaveBeenCalledWith('activitypub.outbox.post', {
      collectionUri: 'https://fed.example.com/users/alice/outbox',
      '@context': 'https://www.w3.org/ns/activitystreams',
      actor: 'https://fed.example.com/users/alice',
      type: 'Accept',
      object: {
        id: 'https://remote.example/activities/follow-1',
        type: 'Follow',
        actor: 'https://remote.example/users/bob',
        object: 'https://fed.example.com/users/alice/muted'
      },
      to: 'https://remote.example/users/bob'
    });
  });
});
