'use strict';

const assert = require('assert');
const service = require('./services/actor-metadata-verification.service');

let passed = 0;
let failed = 0;

const ok = async (label, fn) => {
  try {
    await fn();
    console.log(`  [ok] ${label}`);
    passed++;
  } catch (e) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${e.message}`);
    failed++;
  }
};

(async () => {
  console.log('\n§ 1  method-level rel=me verification checks');

  const instance = {
    ...service.methods,
    _relMeCache: new Map(),
    _breakersByHost: new Map(),
    getBreakerForHost() {
      return {
        execute: async fn => fn()
      };
    }
  };

  await ok('verifyRelMeLink returns verified=true when verification method confirms reciprocal rel=me', async () => {
    instance._relMeCache.clear();
    instance.verifyRelMeWithFetch = async ({ actorUri, href }) => ({
      actorUri: 'https://social.example/alice',
      href,
      verified: true,
      reason: 'verified',
      checkedAt: new Date().toISOString()
    });

    const ctx = {
      params: {
        actorUri: 'https://social.example/alice',
        href: 'https://site.example/about'
      }
    };
    const result = await service.actions.verifyRelMeLink.handler.call(instance, ctx);
    assert.equal(result.verified, true);
    assert.equal(result.reason, 'verified');
    assert.equal(result.cacheHit, false);
  });

  await ok('verifyRelMeLink uses cache for repeated checks', async () => {
    instance._relMeCache.clear();
    let calls = 0;
    instance.verifyRelMeWithFetch = async ({ actorUri, href }) => {
      calls += 1;
      return {
        actorUri,
        href,
        verified: false,
        reason: 'no_reciprocal_rel_me_link',
        checkedAt: new Date().toISOString()
      };
    };

    const ctx = {
      params: {
        actorUri: 'https://social.example/alice',
        href: 'https://site.example/about-cache'
      }
    };

    const first = await service.actions.verifyRelMeLink.handler.call(instance, ctx);
    const second = await service.actions.verifyRelMeLink.handler.call(instance, ctx);

    assert.equal(calls, 1);
    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.equal(second.verified, false);
    assert.equal(second.reason, 'no_reciprocal_rel_me_link');
  });

  await ok('verifyRelMeLink isolates dependency failures (no throw)', async () => {
    instance._relMeCache.clear();
    instance.verifyRelMeWithFetch = async () => {
      throw new Error('network unavailable');
    };

    const ctx = {
      params: {
        actorUri: 'https://social.example/alice',
        href: 'https://site.example/about-failure'
      }
    };

    const result = await service.actions.verifyRelMeLink.handler.call(instance, ctx);
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'verification_failed');
    assert.equal(result.cacheHit, false);
  });

  await ok('verifyActorMetadata collects rel=me links and summarizes results', async () => {
    const ctx = {
      params: {
        actorUri: 'https://social.example/alice',
        actor: {
          type: 'Person',
          attachment: [
            { type: 'Link', name: 'Site', href: 'https://site.example', rel: ['me'] },
            { type: 'Link', name: 'Other', href: 'https://other.example', rel: ['nofollow'] },
          ],
        },
      },
      call: async (action, payload) => {
        if (action !== 'actor-metadata-verification.verifyRelMeLink') throw new Error('unexpected action');
        return {
          actorUri: payload.actorUri,
          href: payload.href,
          verified: payload.href === 'https://site.example/',
          reason: payload.href === 'https://site.example/' ? 'verified' : 'no_reciprocal_rel_me_link',
          checkedAt: new Date().toISOString(),
          cacheHit: false,
        };
      }
    };

    const result = await service.actions.verifyActorMetadata.handler.call(instance, ctx);
    assert.equal(result.summary.totalRelMeLinks, 1);
    assert.equal(result.summary.verifiedCount, 1);
    assert.equal(result.links.length, 1);
  });

  if (failed > 0) {
    console.error(`\nrel_me_verification_proof_failed (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }

  console.log(`\nrel_me_verification_proof_ok (${passed} assertions)`);
})();
