'use strict';

const assert = require('assert');
const followableApi = require('./services/followable-api.service');

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
  console.log('\n§ 1  followable API action');

  await ok('uses authenticated webId as follower actor and returns 202', async () => {
    const service = {
      ...followableApi.methods
    };

    const calls = [];
    const ctx = {
      params: {
        objectUri: 'https://social.example/objects/1',
        recursionLimit: 1,
        requireFollowersCollection: true
      },
      meta: {
        webId: 'https://social.example/actors/me'
      },
      call: async (action, params) => {
        calls.push({ action, params });
        if (action === 'followable.followObject') {
          return { success: true, resolved: { inboxUri: 'https://social.example/actors/alice/inbox' } };
        }
        throw new Error(`unexpected action ${action}`);
      }
    };

    const result = await followableApi.actions.follow.handler.call(service, ctx);

    assert.equal(result.success, true);
    assert.equal(ctx.meta.$statusCode, 202);
    const delegated = calls.find(entry => entry.action === 'followable.followObject');
    assert(delegated);
    assert.equal(delegated.params.followerActorUri, 'https://social.example/actors/me');
  });

  await ok('rejects anonymous callers', async () => {
    const service = {
      ...followableApi.methods
    };

    let err;
    try {
      await followableApi.actions.follow.handler.call(service, {
        params: { objectUri: 'https://social.example/objects/1' },
        meta: { webId: 'anon' },
        call: async () => null
      });
    } catch (error) {
      err = error;
    }

    assert(err);
    assert.equal(err.code, 401);
  });

  if (failed > 0) {
    console.error(`\nproof_fep_efda_followable_api_failed (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }

  console.log(`\nfep_efda_followable_api_proof_ok (${passed} assertions)`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
