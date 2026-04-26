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
  let undoCaptured = null;
  let invalidCaptured = null;

  broker.createService({
    name: 'activitypub.outbox',
    actions: {
      post: {
        async handler(ctx) {
          if (ctx.params.type === 'Undo') {
            undoCaptured = ctx.params;
          } else if (ctx.params.id === 'urn:invalid-shortcode') {
            invalidCaptured = ctx.params;
          } else {
            outboxCaptured = ctx.params;
          }
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
      type: 'EmojiReact',
      actor: 'http://localhost:3000/alice',
      object: 'https://remote.example/objects/1',
      content: ' :blobwtfnotlikethis: ',
      tag: [
        {
          type: 'Emoji',
          id: 'https://alice.example/emojis/blobwtfnotlikethis',
          name: 'blobwtfnotlikethis',
          icon: {
            type: 'Image',
            mediaType: 'image/png',
            url: 'https://alice.example/files/blob.png'
          }
        }
      ]
    });

    assert.ok(outboxCaptured, 'outbox action should be called for EmojiReact');
    assert.strictEqual(outboxCaptured.content, ':blobwtfnotlikethis:');
    assert.ok(Array.isArray(outboxCaptured.tag), 'EmojiReact tag should remain an array');
    assert.strictEqual(outboxCaptured.tag.length, 1, 'EmojiReact should keep one matching Emoji tag');
    assert.strictEqual(outboxCaptured.tag[0].type, 'Emoji');
    assert.strictEqual(outboxCaptured.tag[0].name, ':blobwtfnotlikethis:');
    assert.ok(Array.isArray(outboxCaptured['@context']), 'EmojiReact should include object @context array');
    assert.strictEqual(
      outboxCaptured['@context'][0],
      'https://www.w3.org/ns/activitystreams',
      'EmojiReact context should include ActivityStreams'
    );
    assert.ok(
      outboxCaptured['@context'].some(
        entry => entry && typeof entry === 'object' && entry.EmojiReact === 'litepub:EmojiReact'
      ),
      'EmojiReact context mapping should be injected when missing'
    );

    await broker.call('activitypub.inbox.post', {
      collectionUri: 'http://localhost:3000/alice/inbox',
      type: 'Like',
      actor: 'https://remote.example/users/bob',
      object: 'https://remote.example/objects/2',
      content: '  🔥  '
    });

    assert.ok(inboxCaptured, 'inbox action should be called for Like+content');
    assert.strictEqual(inboxCaptured.type, 'Like');
    assert.strictEqual(inboxCaptured.content, '🔥', 'Like content should normalize to single grapheme');

    await broker.call('activitypub.outbox.post', {
      collectionUri: 'http://localhost:3000/alice/outbox',
      type: 'Undo',
      actor: 'http://localhost:3000/alice',
      object: {
        type: 'Like',
        object: 'https://remote.example/objects/3',
        content: ' :party_parrot: ',
        tag: [{ type: 'Emoji', name: ':party_parrot:' }]
      }
    });

    assert.ok(undoCaptured, 'Undo activity should be captured');
    assert.ok(undoCaptured.object, 'Undo should keep object payload');
    assert.strictEqual(undoCaptured.object.content, ':party_parrot:');
    assert.strictEqual(undoCaptured.object.tag[0].name, ':party_parrot:');

    await broker.call('activitypub.outbox.post', {
      collectionUri: 'http://localhost:3000/alice/outbox',
      id: 'urn:invalid-shortcode',
      type: 'EmojiReact',
      actor: 'http://localhost:3000/alice',
      object: 'https://remote.example/objects/4',
      content: 'party_parrot',
      tag: [{ type: 'Mention', href: 'https://remote.example/users/bob' }]
    });

    assert.ok(invalidCaptured, 'invalid shortcode payload should still pass through action');
    assert.strictEqual(
      invalidCaptured.content,
      'party_parrot',
      'invalid shortcode reaction should not be normalized without matching Emoji tag'
    );
    assert.ok(
      !Array.isArray(invalidCaptured['@context']),
      'invalid shortcode reaction should not be transformed into EmojiReact context-complete form'
    );

    console.log('emoji_reactions_ap_actions_e2e_proof_ok');
  } finally {
    await broker.stop();
  }
}

run().catch(error => {
  console.error('emoji_reactions_ap_actions_e2e_proof_failed', error);
  process.exit(1);
});
