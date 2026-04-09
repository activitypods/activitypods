'use strict';

/**
 * Proof script: FEP-fb2a Actor Metadata
 *
 * Run from pod-provider/backend:
 *   node proof-fep-fb2a-actor-metadata.js
 */

const assert = require('assert');
const {
  normalizeActorMetadataAttachments,
  annotateActorMetadataVerification,
  normalizeLegacyPropertyValue,
  normalizeLinkMetadata,
  normalizeNoteMetadata
} = require('./utils/actor-metadata');
const ActorMetadataMiddleware = require('./middlewares/actor-metadata');

let passed = 0;
let failed = 0;

const ok = (label, fn) => {
  try {
    fn();
    console.log(`  [ok] ${label}`);
    passed++;
  } catch (e) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${e.message}`);
    failed++;
  }
};

const okAsync = async (label, fn) => {
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
  // ========================================================================
  // § 1 note/link metadata normalization
  // ========================================================================
  console.log('\n§ 1  note/link metadata normalization');

  ok('normalizes canonical Note metadata', () => {
    const note = normalizeNoteMetadata({ type: 'Note', name: 'Pronouns', content: 'they/them' });
    assert.deepStrictEqual(note, { type: 'Note', name: 'Pronouns', content: 'they/them' });
  });

  ok('rejects invalid Note metadata missing content', () => {
    assert.strictEqual(normalizeNoteMetadata({ type: 'Note', name: 'Pronouns' }), null);
  });

  ok('normalizes Link metadata with rel array', () => {
    const link = normalizeLinkMetadata({
      type: 'Link',
      name: 'My portfolio',
      href: 'https://example.com',
      rel: ['me', 'nofollow']
    });
    assert.deepStrictEqual(link, {
      type: 'Link',
      name: 'My portfolio',
      href: 'https://example.com/',
      rel: ['me', 'nofollow']
    });
  });

  ok('rejects Link metadata without valid href', () => {
    assert.strictEqual(normalizeLinkMetadata({ type: 'Link', href: 'javascript:alert(1)' }), null);
  });

  // ========================================================================
  // § 2 legacy PropertyValue backward compatibility
  // ========================================================================
  console.log('\n§ 2  legacy PropertyValue backward compatibility');

  ok('converts PropertyValue + value to Note metadata', () => {
    const legacy = normalizeLegacyPropertyValue({
      type: 'PropertyValue',
      name: 'Pronouns',
      value: 'they/them'
    });
    assert.deepStrictEqual(legacy, {
      type: 'Note',
      name: 'Pronouns',
      content: 'they/them'
    });
  });

  ok('converts schema.org#PropertyValue + schema.org#value to Note', () => {
    const legacy = normalizeLegacyPropertyValue({
      type: 'http://schema.org#PropertyValue',
      name: 'Website',
      'http://schema.org#value': 'https://example.com'
    });
    assert.deepStrictEqual(legacy, {
      type: 'Note',
      name: 'Website',
      content: 'https://example.com'
    });
  });

  // ========================================================================
  // § 3 actor attachment list normalization
  // ========================================================================
  console.log('\n§ 3  actor attachment list normalization');

  ok('normalizes actor attachments and preserves non-metadata attachments', () => {
    const actor = {
      type: 'Person',
      attachment: [
        { type: 'Note', name: 'Pronouns', content: 'they/them' },
        { type: 'Link', name: 'Portfolio', href: 'https://example.com', rel: 'me' },
        { type: 'Image', url: 'https://example.com/avatar.jpg' }
      ]
    };

    const result = normalizeActorMetadataAttachments(actor);
    assert.equal(result.attachment.length, 3);
    assert.deepStrictEqual(result.attachment[0], { type: 'Note', name: 'Pronouns', content: 'they/them' });
    assert.deepStrictEqual(result.attachment[1], {
      type: 'Link',
      name: 'Portfolio',
      href: 'https://example.com/',
      rel: ['me']
    });
    assert.deepStrictEqual(result.attachment[2], { type: 'Image', url: 'https://example.com/avatar.jpg' });
  });

  ok('legacy duplicate names are ignored when canonical name already exists', () => {
    const actor = {
      type: 'Person',
      attachment: [
        { type: 'Note', name: 'Pronouns', content: 'they/them' },
        { type: 'PropertyValue', name: 'Pronouns', value: 'she/her' }
      ]
    };

    const result = normalizeActorMetadataAttachments(actor);
    const items = Array.isArray(result.attachment) ? result.attachment : [result.attachment];
    assert.equal(items.length, 1);
    assert.deepStrictEqual(items[0], { type: 'Note', name: 'Pronouns', content: 'they/them' });
  });

  ok('non-actor objects are not modified', () => {
    const note = { type: 'Note', attachment: [{ type: 'Link', href: 'https://example.com' }] };
    assert.strictEqual(normalizeActorMetadataAttachments(note), note);
  });

  ok('annotates rel=me links with verification state', () => {
    const actor = {
      type: 'Person',
      id: 'https://pods.example/alice',
      attachment: {
        type: 'Link',
        name: 'Portfolio',
        href: 'https://example.com',
        rel: ['me']
      }
    };

    const result = annotateActorMetadataVerification(actor, {
      links: [
        {
          href: 'https://example.com/',
          verified: true,
          reason: 'verified',
          checkedAt: '2026-04-03T00:00:00.000Z'
        }
      ]
    });

    assert.equal(result.attachment.verified, true);
    assert.equal(result.attachment.verificationReason, 'verified');
    assert.equal(result.attachment.verifiedAt, '2026-04-03T00:00:00.000Z');
  });

  // ========================================================================
  // § 4 middleware integration
  // ========================================================================
  console.log('\n§ 4  middleware integration');

  await okAsync('normalizes actor object in activitypub.outbox.post Update', async () => {
    const mw = ActorMetadataMiddleware();
    let captured = null;

    const wrapped = mw.localAction(
      async ctx => {
        captured = ctx.params;
        return { ok: true };
      },
      { name: 'activitypub.outbox.post' }
    );

    await wrapped({
      params: {
        collectionUri: 'https://pods.example/alice/outbox',
        type: 'Update',
        actor: 'https://pods.example/alice',
        object: {
          type: 'Person',
          attachment: {
            type: 'http://schema.org#PropertyValue',
            name: 'Pronouns',
            'http://schema.org#value': 'they/them'
          }
        }
      }
    });

    assert.equal(captured.object.attachment.type, 'Note');
    assert.equal(captured.object.attachment.name, 'Pronouns');
    assert.equal(captured.object.attachment.content, 'they/them');
  });

  await okAsync('normalizes result of activitypub.actor.get', async () => {
    const mw = ActorMetadataMiddleware();

    const wrapped = mw.localAction(
      async () => ({
        type: 'Person',
        attachment: {
          type: 'PropertyValue',
          name: 'Website',
          value: 'https://example.com'
        }
      }),
      { name: 'activitypub.actor.get' }
    );

    const result = await wrapped({ params: { actorUri: 'https://pods.example/alice' } });
    assert.equal(result.attachment.type, 'Note');
    assert.equal(result.attachment.name, 'Website');
    assert.equal(result.attachment.content, 'https://example.com');
  });

  await okAsync('annotates verified rel=me links on local actor reads', async () => {
    const mw = ActorMetadataMiddleware();

    const wrapped = mw.localAction(
      async () => ({
        type: 'Person',
        id: 'https://pods.example/alice',
        attachment: {
          type: 'Link',
          name: 'Portfolio',
          href: 'https://example.com',
          rel: ['me']
        }
      }),
      { name: 'activitypub.actor.get' }
    );

    const result = await wrapped({
      params: { actorUri: 'https://pods.example/alice' },
      call(action, params) {
        if (action === 'auth.account.findByWebId') {
          return params.webId === 'https://pods.example/alice' ? { webId: params.webId } : null;
        }
        if (action === 'actor-metadata-verification.verifyActorMetadata') {
          return {
            links: [
              {
                href: 'https://example.com/',
                verified: true,
                reason: 'verified',
                checkedAt: '2026-04-03T00:00:00.000Z'
              }
            ]
          };
        }
        return null;
      }
    });

    assert.equal(result.attachment.verified, true);
    assert.equal(result.attachment.verificationReason, 'verified');
  });

  if (failed > 0) {
    console.error(`\nfep_fb2a_actor_metadata_proof_failed (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }

  console.log(`\nfep_fb2a_actor_metadata_proof_ok (${passed} assertions)`);
})();
