'use strict';

const assert = require('assert');
const { resolveFollowDeliveryTarget, FOLLOWABLE_ERRORS } = require('./utils/followable');
const followableService = require('./services/followable.service');

let passed = 0;
let failed = 0;

const ok = async (label, fn) => {
  try {
    await fn();
    console.log(`  [ok] ${label}`);
    passed++;
  } catch (error) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${error.message}`);
    failed++;
  }
};

(async () => {
  console.log('\n§ 1  resolver algorithm');

  await ok('resolves direct inbox when present', async () => {
    const result = await resolveFollowDeliveryTarget(
      {
        id: 'https://social.example/notes/1',
        followers: 'https://social.example/notes/1/followers',
        inbox: 'https://social.example/notes/1/inbox'
      },
      async () => null,
      { recursionLimit: 1 }
    );

    assert.equal(result.inboxUri, 'https://social.example/notes/1/inbox');
    assert.equal(result.recursionDepthUsed, 0);
  });

  await ok('recurses through attributedTo with depth 1', async () => {
    const result = await resolveFollowDeliveryTarget(
      {
        id: 'https://social.example/objects/1',
        followers: 'https://social.example/objects/1/followers',
        attributedTo: 'https://social.example/actors/alice'
      },
      async uri =>
        uri === 'https://social.example/actors/alice'
          ? { id: uri, inbox: 'https://social.example/actors/alice/inbox' }
          : null,
      { recursionLimit: 1 }
    );

    assert.equal(result.inboxUri, 'https://social.example/actors/alice/inbox');
    assert.equal(result.recursionDepthUsed, 1);
  });

  await ok('throws OBJECT_HAS_UNKNOWN_FOLLOWERS_COLLECTION when followers missing', async () => {
    let err;
    try {
      await resolveFollowDeliveryTarget(
        {
          id: 'https://social.example/objects/2',
          inbox: 'https://social.example/actors/alice/inbox'
        },
        async () => null,
        { recursionLimit: 1 }
      );
    } catch (error) {
      err = error;
    }

    assert(err);
    assert.equal(err.code, FOLLOWABLE_ERRORS.OBJECT_HAS_UNKNOWN_FOLLOWERS_COLLECTION);
  });

  await ok('throws MAX_RECURSION_LIMIT when recursion exceeded', async () => {
    let err;
    try {
      await resolveFollowDeliveryTarget(
        {
          id: 'https://social.example/objects/3',
          followers: 'https://social.example/objects/3/followers',
          attributedTo: 'https://social.example/actors/alice'
        },
        async uri => ({ id: uri, attributedTo: 'https://social.example/actors/bob' }),
        { recursionLimit: 1 }
      );
    } catch (error) {
      err = error;
    }

    assert(err);
    assert.equal(err.code, FOLLOWABLE_ERRORS.MAX_RECURSION_LIMIT);
  });

  console.log('\n§ 2  service followObject action');

  await ok('builds Follow activity and posts to outbox with resolved recipient', async () => {
    const service = {
      ...followableService.methods,
      logger: { debug: () => {} }
    };

    const calls = [];
    const ctx = {
      params: {
        followerActorUri: 'https://social.example/actors/me',
        object: {
          id: 'https://social.example/objects/4',
          followers: 'https://social.example/objects/4/followers',
          attributedTo: 'https://social.example/actors/alice'
        },
        recursionLimit: 1
      },
      call: async (action, params) => {
        calls.push({ action, params });

        if (action === 'ldp.remote.store') return true;
        if (action === 'ldp.resource.get') {
          if (params.resourceUri === 'https://social.example/actors/alice') {
            return {
              id: 'https://social.example/actors/alice',
              inbox: 'https://social.example/actors/alice/inbox'
            };
          }
          return null;
        }
        if (action === 'activitypub.actor.get') {
          if (params.actorUri === 'https://social.example/actors/me') {
            return {
              id: 'https://social.example/actors/me',
              outbox: 'https://social.example/actors/me/outbox'
            };
          }
          return null;
        }
        if (action === 'activitypub.outbox.post') {
          return { id: 'https://social.example/activities/follow-1' };
        }
        return null;
      }
    };

    const result = await followableService.actions.followObject.handler.call(service, ctx);

    assert.equal(result.success, true);
    assert.equal(result.resolved.inboxUri, 'https://social.example/actors/alice/inbox');

    const outboxCall = calls.find(entry => entry.action === 'activitypub.outbox.post');
    assert(outboxCall);
    assert.equal(outboxCall.params.type, 'Follow');
    assert.deepEqual(outboxCall.params.object, {
      id: 'https://social.example/objects/4',
      followers: 'https://social.example/objects/4/followers',
      attributedTo: 'https://social.example/actors/alice'
    });
    assert.equal(outboxCall.params.to, 'https://social.example/actors/alice');
  });

  console.log('\n§ 3  delivery resolution for follow activities');

  await ok('resolves a follow activity to a single remote inbox delivery', async () => {
    const service = {
      ...followableService.methods,
      logger: { debug: () => {} }
    };

    const ctx = {
      params: {
        activity: {
          type: 'Follow',
          object: {
            id: 'https://social.example/objects/5',
            followers: 'https://social.example/objects/5/followers',
            attributedTo: 'https://social.example/actors/alice'
          }
        },
        recursionLimit: 9
      },
      call: async (action, params) => {
        if (action === 'ldp.remote.store') return true;
        if (action === 'ldp.resource.get') {
          if (params.resourceUri === 'https://social.example/actors/alice') {
            return {
              id: 'https://social.example/actors/alice',
              inbox: 'https://social.example/actors/alice/inbox'
            };
          }
          return null;
        }
        if (action === 'activitypub.actor.get') return null;
        return null;
      }
    };

    const result = await followableService.actions.resolveFollowActivityDelivery.handler.call(service, ctx);

    assert.equal(result.success, true);
    assert.equal(result.resolved.recursionDepthUsed, 1);
    assert.deepEqual(result.delivery, {
      actor: 'https://social.example/actors/alice',
      targetDomain: 'social.example',
      recipients: ['https://social.example/actors/alice/inbox']
    });
  });

  if (failed > 0) {
    console.error(`\nproof_fep_efda_followable_objects_failed (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }

  console.log(`\nfep_efda_followable_objects_proof_ok (${passed} assertions)`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
