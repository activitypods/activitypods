jest.mock('@semapps/activitypub', () => ({
  ActivitiesHandlerMixin: {},
  ACTIVITY_TYPES: {
    BLOCK: 'Block',
    UNDO: 'Undo',
    FOLLOW: 'Follow',
    ACCEPT: 'Accept'
  },
  ACTOR_TYPES: {
    PERSON: 'Person',
    APPLICATION: 'Application'
  }
}));

const serviceDefinition = require('../services/activitypub-blocked-collection.service');

describe('activitypub-blocked-collection service', () => {
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

  test('started registers and backfills blocked and blocks collections', async () => {
    const broker = {
      call: jest.fn(async action => {
        if (action === 'auth.account.find') {
          return [{ webId: 'https://fed.example.com/users/alice' }];
        }
        if (action === 'activitypub.actor.get') {
          return {
            blocked: 'https://fed.example.com/users/alice/blocked',
            blocks: 'https://fed.example.com/users/alice/blocks'
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
      service.settings.blockedCollectionOptions
    );
    expect(broker.call).toHaveBeenCalledWith(
      'activitypub.collections-registry.register',
      service.settings.blocksCollectionOptions
    );
    expect(broker.call).toHaveBeenCalledWith('activitypub.collections-registry.createAndAttachCollection', {
      objectUri: 'https://fed.example.com/users/alice',
      collection: service.settings.blockedCollectionOptions
    });
    expect(broker.call).toHaveBeenCalledWith('activitypub.collections-registry.createAndAttachCollection', {
      objectUri: 'https://fed.example.com/users/alice',
      collection: service.settings.blocksCollectionOptions
    });
    expect(broker.getLocalService).toHaveBeenCalledWith('activitypub.side-effects');
  });

  test('blockActor adds the emitted Block activity to both collections', async () => {
    const service = createService();
    const ctx = {
      call: jest.fn(async action => {
        if (action === 'activitypub.actor.get') {
          return {
            blocked: 'https://fed.example.com/users/alice/blocked',
            blocks: 'https://fed.example.com/users/alice/blocks'
          };
        }
        return undefined;
      })
    };

    await serviceDefinition.activities.blockActor.onEmit.call(
      service,
      ctx,
      { id: 'https://fed.example.com/activities/block-1', type: 'Block' },
      'https://fed.example.com/users/alice'
    );

    expect(ctx.call).toHaveBeenCalledWith('activitypub.collection.add', {
      collectionUri: 'https://fed.example.com/users/alice/blocked',
      itemUri: 'https://fed.example.com/activities/block-1'
    });
    expect(ctx.call).toHaveBeenCalledWith('activitypub.collection.add', {
      collectionUri: 'https://fed.example.com/users/alice/blocks',
      itemUri: 'https://fed.example.com/activities/block-1'
    });
  });

  test('undoBlockActor removes the Block activity from both collections', async () => {
    const service = createService();
    const ctx = {
      call: jest.fn(async action => {
        if (action === 'activitypub.actor.get') {
          return {
            blocked: 'https://fed.example.com/users/alice/blocked',
            blocks: 'https://fed.example.com/users/alice/blocks'
          };
        }
        return undefined;
      })
    };

    await serviceDefinition.activities.undoBlockActor.onEmit.call(
      service,
      ctx,
      { type: 'Undo', object: 'https://fed.example.com/activities/block-1' },
      'https://fed.example.com/users/alice'
    );

    expect(ctx.call).toHaveBeenCalledWith('activitypub.collection.remove', {
      collectionUri: 'https://fed.example.com/users/alice/blocked',
      itemUri: 'https://fed.example.com/activities/block-1'
    });
    expect(ctx.call).toHaveBeenCalledWith('activitypub.collection.remove', {
      collectionUri: 'https://fed.example.com/users/alice/blocks',
      itemUri: 'https://fed.example.com/activities/block-1'
    });
  });

  test('setBlockedCollectionPublicState enables public read and attaches followers collection', async () => {
    const service = createService({
      ensureCollectionsForActor: jest.fn(),
      resolveBlockedCollectionUri: jest.fn(async () => 'https://fed.example.com/users/alice/blocked'),
      ensureBlockedFollowersCollection: jest.fn(async () => 'https://fed.example.com/users/alice/blocked/followers'),
      detachBlockedFollowersCollection: jest.fn(),
      setBlockedCollectionPublicFlag: jest.fn(),
      ensurePublicReadOnBlockedCollection: jest.fn(),
      getBlockedCollectionSharingStateByCollectionUri: jest.fn(async () => ({
        collectionUri: 'https://fed.example.com/users/alice/blocked',
        public: true,
        followersCollectionUri: 'https://fed.example.com/users/alice/blocked/followers'
      }))
    });

    const ctx = { call: jest.fn() };
    const result = await service.setBlockedCollectionPublicState(ctx, 'https://fed.example.com/users/alice', true);

    expect(service.ensureCollectionsForActor).toHaveBeenCalledWith(ctx, 'https://fed.example.com/users/alice');
    expect(service.ensureBlockedFollowersCollection).toHaveBeenCalledWith(
      ctx,
      'https://fed.example.com/users/alice/blocked',
      'https://fed.example.com/users/alice'
    );
    expect(service.setBlockedCollectionPublicFlag).toHaveBeenCalledWith(
      ctx,
      'https://fed.example.com/users/alice/blocked',
      true
    );
    expect(service.ensurePublicReadOnBlockedCollection).toHaveBeenCalledWith(
      ctx,
      'https://fed.example.com/users/alice/blocked',
      'https://fed.example.com/users/alice',
      true
    );
    expect(result).toEqual({
      collectionUri: 'https://fed.example.com/users/alice/blocked',
      public: true,
      followersCollectionUri: 'https://fed.example.com/users/alice/blocked/followers'
    });
  });

  test('followBlockedCollection stores the follower and emits Accept when the list is public', async () => {
    const service = createService({
      extractFollowTargetCollectionUri: jest.fn(() => 'https://fed.example.com/users/alice/blocked'),
      getBlockedCollectionOwnerUri: jest.fn(() => 'https://fed.example.com/users/alice'),
      getBlockedCollectionSharingStateByCollectionUri: jest.fn(async () => ({
        collectionUri: 'https://fed.example.com/users/alice/blocked',
        public: true,
        followersCollectionUri: 'https://fed.example.com/users/alice/blocked/followers'
      })),
      ensureBlockedFollowersCollection: jest.fn(async () => 'https://fed.example.com/users/alice/blocked/followers')
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

    await serviceDefinition.activities.followBlockedCollection.onReceive.call(
      service,
      ctx,
      {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: 'https://remote.example/activities/follow-1',
        type: 'Follow',
        actor: 'https://remote.example/users/bob',
        object: 'https://fed.example.com/users/alice/blocked'
      },
      'https://fed.example.com/users/alice'
    );

    expect(ctx.call).toHaveBeenCalledWith('activitypub.collection.add', {
      collectionUri: 'https://fed.example.com/users/alice/blocked/followers',
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
        object: 'https://fed.example.com/users/alice/blocked'
      },
      to: 'https://remote.example/users/bob'
    });
  });
});
