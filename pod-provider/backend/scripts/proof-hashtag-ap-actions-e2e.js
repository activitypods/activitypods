const assert = require('assert');
const { ServiceBroker } = require('moleculer');
const HashtagNormalizationMiddleware = require('../middlewares/hashtag-normalization');

async function run() {
  const broker = new ServiceBroker({
    logger: false,
    middlewares: [HashtagNormalizationMiddleware()]
  });

  let outboxCaptured = null;
  let inboxCaptured = null;

  broker.createService({
    name: 'activitypub.outbox',
    actions: {
      post: {
        async handler(ctx) {
          outboxCaptured = ctx.params;
          return ctx.params;
        }
      }
    }
  });

  broker.createService({
    name: 'activitypub.inbox',
    actions: {
      post: {
        async handler(ctx) {
          inboxCaptured = ctx.params;
          return ctx.params;
        }
      }
    }
  });

  await broker.start();

  try {
    await broker.call('activitypub.outbox.post', {
      collectionUri: 'http://localhost:3000/alice/outbox',
      type: 'Create',
      actor: 'http://localhost:3000/alice',
      object: {
        type: 'Note',
        id: 'http://localhost:3000/alice/notes/1',
        content: 'Hello #World from #ActivityPods and #Bad-Tag',
        tag: [
          { type: 'Mention', href: 'https://remote.example/users/bob' },
          { type: 'Hashtag', name: '#MiXeD_Case' },
          { type: 'Hashtag', name: '#bad-tag' }
        ]
      }
    });

    assert.ok(outboxCaptured, 'outbox action should be called');
    assert.ok(outboxCaptured.object, 'outbox payload should contain object');
    assert.ok(Array.isArray(outboxCaptured.object.tag), 'outbox object.tag should be an array');

    const outboxTags = outboxCaptured.object.tag;
    assert.ok(
      outboxTags.some(t => t.type === 'Mention'),
      'outbox should preserve mention tags'
    );
    assert.ok(
      outboxTags.some(t => t.type === 'Hashtag' && t.name === '#world'),
      'outbox should include #world'
    );
    assert.ok(
      outboxTags.some(t => t.type === 'Hashtag' && t.name === '#activitypods'),
      'outbox should include #activitypods'
    );
    assert.ok(
      outboxTags.some(t => t.type === 'Hashtag' && t.name === '#mixed_case'),
      'outbox should normalize mixed-case hashtag tag object'
    );
    assert.ok(
      !outboxTags.some(t => t.type === 'Hashtag' && t.name === '#bad-tag'),
      'outbox should remove invalid hashtag punctuation form'
    );

    await broker.call('activitypub.inbox.post', {
      collectionUri: 'http://localhost:3000/alice/inbox',
      type: 'Create',
      actor: 'https://remote.example/users/charlie',
      object: {
        type: 'Note',
        id: 'https://remote.example/notes/abc',
        content: 'Inbound #Remote_Tag update'
      }
    });

    assert.ok(inboxCaptured, 'inbox action should be called');
    assert.ok(inboxCaptured.object, 'inbox payload should contain object');
    assert.ok(Array.isArray(inboxCaptured.object.tag), 'inbox object.tag should be an array');
    assert.ok(
      inboxCaptured.object.tag.some(t => t.type === 'Hashtag' && t.name === '#remote_tag'),
      'inbox should include normalized hashtag from inbound content'
    );

    console.log('hashtag_ap_actions_e2e_proof_ok');
  } finally {
    await broker.stop();
  }
}

run().catch(error => {
  console.error('hashtag_ap_actions_e2e_proof_failed', error);
  process.exit(1);
});
