'use strict';

const assert = require('assert');
const service = require('./services/actor-metadata-api.service');

let passed = 0;
let failed = 0;

const ok = async (label, fn) => {
  try {
    await fn();
    console.log(`  [ok] ${label}`);
    passed += 1;
  } catch (e) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${e.message}`);
    failed += 1;
  }
};

(async () => {
  console.log('\n§ 1  actor-metadata-api ownership and validation');

  const instance = {
    ...service,
    ...service.methods,
  };

  await ok('verifyActorMetadata defaults actorUri to requester', async () => {
    const ctx = {
      params: {},
      meta: { webId: 'https://pods.example/alice' },
      call: async (action, params) => {
        assert.equal(action, 'actor-metadata-verification.verifyActorMetadata');
        assert.equal(params.actorUri, 'https://pods.example/alice');
        return { ok: true };
      }
    };

    const result = await service.actions.verifyActorMetadata.handler.call(instance, ctx);
    assert.deepStrictEqual(result, { ok: true });
  });

  await ok('verifyActorMetadata rejects actorUri mismatch', async () => {
    const ctx = {
      params: { actorUri: 'https://pods.example/bob' },
      meta: { webId: 'https://pods.example/alice' },
      call: async () => {
        throw new Error('must not call downstream on scope mismatch');
      }
    };

    try {
      await service.actions.verifyActorMetadata.handler.call(instance, ctx);
      throw new Error('expected FORBIDDEN_ACTOR_SCOPE');
    } catch (e) {
      assert.equal(e.type, 'FORBIDDEN_ACTOR_SCOPE');
      assert.equal(e.code, 403);
    }
  });

  await ok('verifyRelMeLink validates href and passes normalized args', async () => {
    const ctx = {
      params: { href: 'https://site.example/about' },
      meta: { webId: 'https://pods.example/alice' },
      call: async (action, params) => {
        assert.equal(action, 'actor-metadata-verification.verifyRelMeLink');
        assert.equal(params.actorUri, 'https://pods.example/alice');
        assert.equal(params.href, 'https://site.example/about');
        return { verified: true };
      }
    };

    const result = await service.actions.verifyRelMeLink.handler.call(instance, ctx);
    assert.deepStrictEqual(result, { verified: true });
  });

  await ok('verifyRelMeLink rejects non-https href', async () => {
    const ctx = {
      params: { href: 'http://site.example/about' },
      meta: { webId: 'https://pods.example/alice' },
      call: async () => {
        throw new Error('must not call downstream on invalid href');
      }
    };

    try {
      await service.actions.verifyRelMeLink.handler.call(instance, ctx);
      throw new Error('expected INVALID_REL_ME_HREF');
    } catch (e) {
      assert.equal(e.type, 'INVALID_REL_ME_HREF');
      assert.equal(e.code, 400);
    }
  });

  if (failed > 0) {
    console.error(`\nactor_metadata_api_proof_failed (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }

  console.log(`\nactor_metadata_api_proof_ok (${passed} assertions)`);
})();
