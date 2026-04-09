'use strict';
/**
 * Proof script: FEP-dd4b Quote Posts normalization (AP-side)
 *
 * Run from pod-provider/backend:
 *   node proof-fep-dd4b-quote-posts.js
 */

const assert = require('assert');
const {
  isQuotePost,
  getQuoteObjectIri,
  normalizeQuotePost,
  sanitizeContent,
  normalizeTag,
  normalizeInReplyTo
} = require('./utils/quote-posts');
const QuotePostsMiddleware = require('./middlewares/quote-posts');

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
  // ---------------------------------------------------------------------------
  // § 1  isQuotePost detection
  // ---------------------------------------------------------------------------
  console.log('\n§ 1  isQuotePost detection');

  await ok('plain Announce (no content) is NOT a quote post', () => {
    assert.equal(
      isQuotePost({
        type: 'Announce',
        actor: 'https://example.com/users/evan',
        object: 'https://example.com/notes/1234'
      }),
      false
    );
  });

  await ok('Announce with whitespace-only content is NOT a quote post', () => {
    assert.equal(
      isQuotePost({
        type: 'Announce',
        object: 'https://example.com/notes/1234',
        content: '   '
      }),
      false
    );
  });

  await ok('Announce with content IS a quote post', () => {
    assert.equal(
      isQuotePost({
        type: 'Announce',
        object: 'https://example.com/notes/1234',
        content: 'I think that this is a good point and should be shared.'
      }),
      true
    );
  });

  await ok('non-Announce activity is never a quote post', () => {
    assert.equal(
      isQuotePost({
        type: 'Create',
        object: { type: 'Note', content: 'hello' },
        content: 'some text'
      }),
      false
    );
  });

  // ---------------------------------------------------------------------------
  // § 2  getQuoteObjectIri
  // ---------------------------------------------------------------------------
  console.log('\n§ 2  getQuoteObjectIri');

  await ok('extracts plain URI string object', () => {
    assert.equal(
      getQuoteObjectIri({ type: 'Announce', object: 'https://example.com/notes/1234', content: 'c' }),
      'https://example.com/notes/1234'
    );
  });

  await ok('extracts IRI from inline object with id', () => {
    assert.equal(
      getQuoteObjectIri({
        type: 'Announce',
        object: { id: 'https://example.com/notes/1234', type: 'Note' },
        content: 'c'
      }),
      'https://example.com/notes/1234'
    );
  });

  await ok('returns null when object is missing', () => {
    assert.equal(getQuoteObjectIri({ type: 'Announce', content: 'c' }), null);
  });

  // ---------------------------------------------------------------------------
  // § 3  sanitizeContent
  // ---------------------------------------------------------------------------
  console.log('\n§ 3  sanitizeContent');

  await ok('passes safe inline HTML through', () => {
    const input = '<a href="https://example.com/tags/foo">#foo</a>';
    assert.ok(sanitizeContent(input).includes('#foo'));
  });

  await ok('strips script tags from content', () => {
    const out = sanitizeContent('text <script>alert(1)</script> more');
    assert.ok(!out.includes('<script>'), 'script tag removed');
    assert.ok(out.includes('text'), 'plain text preserved');
  });

  await ok('strips disallowed attributes', () => {
    const out = sanitizeContent('<a href="https://example.com" onclick="evil()">link</a>');
    assert.ok(!out.includes('onclick'), 'onclick removed');
    assert.ok(out.includes('href'), 'href kept');
  });

  // ---------------------------------------------------------------------------
  // § 4  normalizeTag
  // ---------------------------------------------------------------------------
  console.log('\n§ 4  normalizeTag');

  await ok('normalizes a valid Hashtag', () => {
    const tag = { type: 'Hashtag', href: 'https://example.com/tags/foo', name: 'foo' };
    assert.deepStrictEqual(normalizeTag(tag), tag);
  });

  await ok('normalizes a valid Mention', () => {
    const tag = { type: 'Mention', href: 'https://example.com/users/jeff', name: 'jeff' };
    assert.deepStrictEqual(normalizeTag(tag), tag);
  });

  await ok('rejects unknown tag type', () => {
    assert.equal(normalizeTag({ type: 'Link', href: 'https://example.com' }), null);
  });

  await ok('rejects tag missing href', () => {
    assert.equal(normalizeTag({ type: 'Hashtag', name: 'foo' }), null);
  });

  await ok('rejects non-http href', () => {
    assert.equal(normalizeTag({ type: 'Hashtag', href: 'javascript:evil()', name: 'foo' }), null);
  });

  // ---------------------------------------------------------------------------
  // § 5  normalizeInReplyTo
  // ---------------------------------------------------------------------------
  console.log('\n§ 5  normalizeInReplyTo');

  await ok('passes plain URI through', () => {
    assert.equal(normalizeInReplyTo('https://example.com/activities/abc'), 'https://example.com/activities/abc');
  });

  await ok('extracts URI from object with id', () => {
    assert.equal(
      normalizeInReplyTo({ id: 'https://example.com/activities/abc' }),
      'https://example.com/activities/abc'
    );
  });

  await ok('returns undefined for non-URI string', () => {
    assert.equal(normalizeInReplyTo('not-a-url'), undefined);
  });

  await ok('returns undefined for null', () => {
    assert.equal(normalizeInReplyTo(null), undefined);
  });

  // ---------------------------------------------------------------------------
  // § 6  normalizeQuotePost — full activity normalization
  // ---------------------------------------------------------------------------
  console.log('\n§ 6  normalizeQuotePost — full activity normalization');

  await ok('returns same reference when nothing changes', () => {
    const activity = {
      type: 'Announce',
      actor: 'https://example.com/users/evan',
      object: 'https://example.com/notes/1234',
      content: 'Safe text with no HTML.'
    };
    assert.strictEqual(normalizeQuotePost(activity), activity);
  });

  await ok('sanitizes unsafe content and returns new object', () => {
    const activity = {
      type: 'Announce',
      object: 'https://example.com/notes/1234',
      content: 'hello <script>evil()</script> world'
    };
    const result = normalizeQuotePost(activity);
    assert.notStrictEqual(result, activity);
    assert.ok(!result.content.includes('<script>'));
    assert.ok(result.content.includes('hello'));
  });

  await ok('removes invalid tag entries, keeps valid ones (unwraps single)', () => {
    const activity = {
      type: 'Announce',
      object: 'https://example.com/notes/1234',
      content: 'Some commentary',
      tag: [
        { type: 'Hashtag', href: 'https://example.com/tags/foo', name: 'foo' },
        { type: 'Unknown', href: 'https://example.com/whatever' }
      ]
    };
    const result = normalizeQuotePost(activity);
    assert.deepStrictEqual(result.tag, { type: 'Hashtag', href: 'https://example.com/tags/foo', name: 'foo' });
  });

  await ok('normalizes inReplyTo object to plain URI', () => {
    const activity = {
      type: 'Announce',
      object: 'https://example.com/notes/1234',
      content: 'Replying with a quote',
      inReplyTo: { id: 'https://example.com/activities/rrrsssttt' }
    };
    const result = normalizeQuotePost(activity);
    assert.equal(result.inReplyTo, 'https://example.com/activities/rrrsssttt');
  });

  await ok('removes invalid inReplyTo', () => {
    const activity = {
      type: 'Announce',
      object: 'https://example.com/notes/1234',
      content: 'Commentary',
      inReplyTo: 'not-a-url'
    };
    const result = normalizeQuotePost(activity);
    assert.ok(!('inReplyTo' in result));
  });

  await ok('does not modify plain Announce (no content)', () => {
    const activity = { type: 'Announce', object: 'https://example.com/notes/1234' };
    assert.strictEqual(normalizeQuotePost(activity), activity);
  });

  await ok('preserves all FEP-dd4b spec Mention example fields', () => {
    const activity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: 'https://example.com/activities/lllmmnnoo',
      type: 'Announce',
      actor: 'https://example.com/users/evan',
      to: ['https://example.com/users/evan/followers', 'https://example.com/users/jeff'],
      object: {
        id: 'https://example.com/notes/1234',
        type: 'Note',
        attributedTo: 'https://example.com/users/franklin'
      },
      content: "<a href='https://example.com/users/jeff'>@jeff</a> you might like this.",
      tag: { type: 'Mention', href: 'https://example.com/users/jeff', name: 'jeff' }
    };
    const result = normalizeQuotePost(activity);
    assert.equal(result.type, 'Announce');
    assert.ok(result.content.includes('jeff'));
    assert.deepStrictEqual(result.tag, activity.tag);
    assert.equal(result.actor, activity.actor);
    assert.deepStrictEqual(result.to, activity.to);
  });

  // ---------------------------------------------------------------------------
  // § 7  QuotePostsMiddleware — interceptor behaviour
  // ---------------------------------------------------------------------------
  console.log('\n§ 7  QuotePostsMiddleware — interceptor behaviour');

  await ok('middleware passes through plain Announce unchanged', async () => {
    const mw = QuotePostsMiddleware();
    const fakeAction = { name: 'activitypub.outbox.post' };
    let intercepted = null;
    const next = async ctx => {
      intercepted = ctx.params;
      return 'stored';
    };
    const handler = mw.localAction(next, fakeAction);

    const activity = {
      type: 'Announce',
      actor: 'https://example.com/users/evan',
      object: 'https://example.com/notes/1234'
    };
    const ctx = { params: activity, call: async () => {} };
    await handler(ctx);
    assert.strictEqual(intercepted, activity, 'unmodified reference passed through');
  });

  await ok('middleware normalizes quote post content before storage', async () => {
    const mw = QuotePostsMiddleware();
    const fakeAction = { name: 'activitypub.outbox.post' };
    let stored = null;
    const next = async ctx => {
      stored = ctx.params;
      return 'stored';
    };
    const handler = mw.localAction(next, fakeAction);

    const activity = {
      type: 'Announce',
      object: 'https://example.com/notes/1234',
      content: 'Good post <script>bad()</script>'
    };
    const ctx = { params: activity, call: async () => {} };
    await handler(ctx);
    assert.ok(!stored.content.includes('<script>'), 'script stripped before storage');
    assert.ok(stored.content.includes('Good post'), 'clean content preserved');
  });

  await ok('middleware ignores non-outbox/inbox actions', () => {
    const mw = QuotePostsMiddleware();
    const fakeAction = { name: 'ldp.resource.create' };
    const next = async () => 'ok';
    const result = mw.localAction(next, fakeAction);
    assert.strictEqual(result, next);
  });

  await ok('middleware calls activitypub.collection.attach for quote post', async () => {
    const mw = QuotePostsMiddleware();
    const fakeAction = { name: 'activitypub.outbox.post' };
    const calls = [];
    const next = async () => 'stored';
    const handler = mw.localAction(next, fakeAction);

    const ctx = {
      params: {
        id: 'https://example.com/activities/abc',
        type: 'Announce',
        object: 'https://example.com/notes/1234',
        content: 'Great post!'
      },
      call: async (name, params) => {
        calls.push({ name, params });
      }
    };
    await handler(ctx);
    const attachCall = calls.find(c => c.name === 'activitypub.collection.attach');
    assert.ok(attachCall, 'collection.attach was called');
    assert.equal(attachCall.params.collectionUri, 'https://example.com/notes/1234/shares');
    assert.equal(attachCall.params.item, 'https://example.com/activities/abc');
  });

  await ok('middleware survives collection.attach failure gracefully', async () => {
    const mw = QuotePostsMiddleware();
    const fakeAction = { name: 'activitypub.outbox.post' };
    const next = async () => 'stored';
    const handler = mw.localAction(next, fakeAction);

    const ctx = {
      params: {
        id: 'https://example.com/activities/abc',
        type: 'Announce',
        object: 'https://example.com/notes/1234',
        content: 'Great post!'
      },
      call: async () => {
        throw new Error('collection not found');
      }
    };
    const result = await handler(ctx);
    assert.equal(result, 'stored');
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n${'─'.repeat(50)}`);
  if (failed > 0) {
    console.error(`  fep_dd4b_quote_posts_proof_FAILED (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }
  console.log(`  fep_dd4b_quote_posts_proof_ok (${passed} assertions)`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
