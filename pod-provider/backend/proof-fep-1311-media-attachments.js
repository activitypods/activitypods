'use strict';
/**
 * Proof script: FEP-1311 Media Attachments — AP-side normalization
 *
 * Run from pod-provider/backend:
 *   node proof-fep-1311-media-attachments.js
 *
 * Expected exit: 0 with final line "fep_1311_media_attachments_proof_ok"
 */

const assert = require('assert');
const {
  inferMimeFromUrl,
  inferApTypeFromMime,
  normalizeMediaAttachment,
  normalizeObjectMediaAttachments,
} = require('./utils/media-attachments');
const MediaAttachmentsMiddleware = require('./middlewares/media-attachments');

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

// ============================================================================
// § 1  inferMimeFromUrl
// ============================================================================
console.log('\n§ 1  inferMimeFromUrl');

ok('jpg extension', () => assert.equal(inferMimeFromUrl('https://example.com/img.jpg'), 'image/jpeg'));
ok('jpeg extension', () => assert.equal(inferMimeFromUrl('https://example.com/img.jpeg'), 'image/jpeg'));
ok('png extension', () => assert.equal(inferMimeFromUrl('https://example.com/img.png'), 'image/png'));
ok('gif extension', () => assert.equal(inferMimeFromUrl('https://cdn.example.com/a.gif?v=1'), 'image/gif'));
ok('webp extension', () => assert.equal(inferMimeFromUrl('https://example.com/img.webp'), 'image/webp'));
ok('svg extension', () => assert.equal(inferMimeFromUrl('https://example.com/img.svg'), 'image/svg+xml'));
ok('avif extension', () => assert.equal(inferMimeFromUrl('https://example.com/img.avif'), 'image/avif'));
ok('mp4 extension', () => assert.equal(inferMimeFromUrl('https://example.com/clip.mp4'), 'video/mp4'));
ok('webm extension', () => assert.equal(inferMimeFromUrl('https://example.com/clip.webm'), 'video/webm'));
ok('mov extension', () => assert.equal(inferMimeFromUrl('https://example.com/clip.mov'), 'video/quicktime'));
ok('mp3 extension', () => assert.equal(inferMimeFromUrl('https://example.com/song.mp3'), 'audio/mpeg'));
ok('ogg extension', () => assert.equal(inferMimeFromUrl('https://example.com/song.ogg'), 'audio/ogg'));
ok('flac extension', () => assert.equal(inferMimeFromUrl('https://example.com/song.flac'), 'audio/flac'));
ok('m4a extension', () => assert.equal(inferMimeFromUrl('https://example.com/song.m4a'), 'audio/mp4'));
ok('unknown extension → undefined', () => assert.equal(inferMimeFromUrl('https://example.com/file.pdf'), undefined));
ok('no extension → undefined', () => assert.equal(inferMimeFromUrl('https://example.com/image'), undefined));
ok('query string stripped before matching', () => assert.equal(inferMimeFromUrl('https://example.com/img.jpg?size=large'), 'image/jpeg'));

// ============================================================================
// § 2  inferApTypeFromMime
// ============================================================================
console.log('\n§ 2  inferApTypeFromMime');

ok('image/* → Image', () => assert.equal(inferApTypeFromMime('image/jpeg'), 'Image'));
ok('video/* → Video', () => assert.equal(inferApTypeFromMime('video/mp4'), 'Video'));
ok('audio/* → Audio', () => assert.equal(inferApTypeFromMime('audio/mpeg'), 'Audio'));
ok('text/html → null', () => assert.equal(inferApTypeFromMime('text/html'), null));
ok('application/pdf → null', () => assert.equal(inferApTypeFromMime('application/pdf'), null));
ok('undefined → null', () => assert.equal(inferApTypeFromMime(undefined), null));

// ============================================================================
// § 3  normalizeMediaAttachment — bare string URLs
// ============================================================================
console.log('\n§ 3  normalizeMediaAttachment — bare string URLs');

ok('jpg URL string → Image object', () => {
  const result = normalizeMediaAttachment('https://example.com/photo.jpg');
  assert.deepStrictEqual(result, { type: 'Image', url: 'https://example.com/photo.jpg', mediaType: 'image/jpeg' });
});

ok('mp4 URL string → Video object', () => {
  const result = normalizeMediaAttachment('https://example.com/clip.mp4');
  assert.deepStrictEqual(result, { type: 'Video', url: 'https://example.com/clip.mp4', mediaType: 'video/mp4' });
});

ok('mp3 URL string → Audio object', () => {
  const result = normalizeMediaAttachment('https://example.com/song.mp3');
  assert.deepStrictEqual(result, { type: 'Audio', url: 'https://example.com/song.mp3', mediaType: 'audio/mpeg' });
});

ok('non-media URL string → returned unchanged', () => {
  const item = 'https://example.com/document.pdf';
  assert.strictEqual(normalizeMediaAttachment(item), item);
});

ok('non-URL string → returned unchanged', () => {
  assert.strictEqual(normalizeMediaAttachment('not a url'), 'not a url');
});

// ============================================================================
// § 4  normalizeMediaAttachment — Document type (Mastodon-style)
// ============================================================================
console.log('\n§ 4  normalizeMediaAttachment — Document type');

ok('Document image/jpeg → Image with url', () => {
  const item = {
    type: 'Document',
    mediaType: 'image/jpeg',
    url: 'https://example.com/photo.jpg',
    name: 'A beautiful cow',
    width: 800,
    height: 600,
  };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.type, 'Image');
  assert.equal(result.url, 'https://example.com/photo.jpg');
  assert.equal(result.mediaType, 'image/jpeg');
  assert.equal(result.name, 'A beautiful cow');
  assert.equal(result.width, 800);
  assert.equal(result.height, 600);
  assert.equal(result.href, undefined, 'no href field on normalized Image');
});

ok('Document video/mp4 → Video with url', () => {
  const item = {
    type: 'Document',
    mediaType: 'video/mp4',
    url: 'https://example.com/clip.mp4',
    width: 1920,
    height: 1080,
    duration: 'PT30S',
    size: 5_000_000,
  };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.type, 'Video');
  assert.equal(result.url, 'https://example.com/clip.mp4');
  assert.equal(result.duration, 'PT30S');
  assert.equal(result.size, 5_000_000);
});

ok('Document audio/mpeg → Audio with url', () => {
  const item = {
    type: 'Document',
    mediaType: 'audio/mpeg',
    url: 'https://example.com/song.mp3',
    duration: 'PT3M45S',
  };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.type, 'Audio');
  assert.equal(result.duration, 'PT3M45S');
});

ok('Document text/plain → returned unchanged (not media)', () => {
  const item = { type: 'Document', mediaType: 'text/plain', url: 'https://example.com/file.txt' };
  assert.strictEqual(normalizeMediaAttachment(item), item);
});

ok('Document no mediaType, jpg URL → Image inferred from extension', () => {
  const item = { type: 'Document', url: 'https://example.com/img.jpg' };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.type, 'Image');
  assert.equal(result.mediaType, 'image/jpeg');
});

ok('Document with Mastodon description → mapped to AP name', () => {
  const item = {
    type: 'Document',
    mediaType: 'image/jpeg',
    url: 'https://example.com/photo.jpg',
    description: 'Mastodon alt text',
  };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.type, 'Image');
  assert.equal(result.name, 'Mastodon alt text');
});

// ============================================================================
// § 5  normalizeMediaAttachment — Link type with media MIME
// ============================================================================
console.log('\n§ 5  normalizeMediaAttachment — Link type');

ok('Link image/jpeg (old-style `href`) → Image with url', () => {
  // extractMediaAttachmentLinks in long-form-text.js produces {type:'Image', href:...}
  // which is a kind of Link; this should be re-homed to url
  const item = {
    type: 'Image',
    href: 'https://example.com/photo.jpg',
    mediaType: 'image/jpeg',
  };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.type, 'Image');
  assert.equal(result.url, 'https://example.com/photo.jpg');
  assert.equal(result.href, undefined, 'href field removed');
});

ok('Link type with image MIME → Image', () => {
  const item = {
    type: 'Link',
    mediaType: 'image/png',
    href: 'https://example.com/logo.png',
    name: 'Logo',
  };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.type, 'Image');
  assert.equal(result.url, 'https://example.com/logo.png');
  assert.equal(result.name, 'Logo');
});

ok('Link type with altText alias → Image name normalized', () => {
  const item = {
    type: 'Link',
    mediaType: 'image/png',
    href: 'https://example.com/logo.png',
    altText: 'Accessible logo',
  };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.type, 'Image');
  assert.equal(result.name, 'Accessible logo');
});

ok('Link type text/html → returned unchanged (OG preview link)', () => {
  const item = {
    type: 'Link',
    mediaType: 'text/html',
    href: 'https://example.com/article',
    name: 'Article Title',
  };
  assert.strictEqual(normalizeMediaAttachment(item), item);
});

ok('Link type no MIME, non-media extension URL → returned unchanged', () => {
  const item = { type: 'Link', href: 'https://example.com/file.pdf' };
  assert.strictEqual(normalizeMediaAttachment(item), item);
});

// ============================================================================
// § 6  normalizeMediaAttachment — already-correct Image/Video/Audio
// ============================================================================
console.log('\n§ 6  normalizeMediaAttachment — already FEP-1311 compliant');

ok('Image with url + mediaType → same reference (no copy)', () => {
  const item = { type: 'Image', url: 'https://example.com/photo.jpg', mediaType: 'image/jpeg', name: 'Photo' };
  assert.strictEqual(normalizeMediaAttachment(item), item);
});

ok('Video with url + mediaType → same reference', () => {
  const item = { type: 'Video', url: 'https://example.com/clip.mp4', mediaType: 'video/mp4' };
  assert.strictEqual(normalizeMediaAttachment(item), item);
});

ok('Image href-only → migrated to url', () => {
  const item = { type: 'Image', href: 'https://example.com/photo.jpg', mediaType: 'image/jpeg' };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.url, 'https://example.com/photo.jpg');
  assert.equal(result.href, undefined);
});

ok('Image with mediaType missing → inferred from extension', () => {
  const item = { type: 'Image', url: 'https://example.com/photo.png' };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.mediaType, 'image/png');
});

ok('Video multi-version url array → same reference (valid FEP-1311)', () => {
  const item = {
    type: 'Video',
    url: [
      { type: 'Link', href: 'https://example.com/low.mp4', mediaType: 'video/mp4', width: 256, height: 144 },
      { type: 'Link', href: 'https://example.com/hd.mp4', mediaType: 'video/mp4', width: 1920, height: 1080 },
    ],
    duration: 'PT3S',
  };
  assert.strictEqual(normalizeMediaAttachment(item), item);
});

ok('Image preserves digestMultibase + size + focalPoint + blurHash', () => {
  const item = {
    type: 'Image',
    href: 'https://example.com/cow.jpg',
    mediaType: 'image/jpeg',
    name: 'A beautiful cow',
    width: 100,
    height: 162,
    size: 9045,
    digestMultibase: 'zQmaeDPzhNL32WQZnnzB1H6QJWvvFNEHdViDB71yrxyXU1t',
    focalPoint: [0.0, 0.5],
    blurHash: 'LGF5?xYk^6#M@-5c,1J5@[or[Q6.',
  };
  const result = normalizeMediaAttachment(item);
  assert.equal(result.url, 'https://example.com/cow.jpg');
  assert.equal(result.size, 9045);
  assert.equal(result.digestMultibase, 'zQmaeDPzhNL32WQZnnzB1H6QJWvvFNEHdViDB71yrxyXU1t');
  assert.deepStrictEqual(result.focalPoint, [0.0, 0.5]);
  assert.equal(result.blurHash, 'LGF5?xYk^6#M@-5c,1J5@[or[Q6.');
});

// ============================================================================
// § 7  normalizeObjectMediaAttachments — object-level normalization
// ============================================================================
console.log('\n§ 7  normalizeObjectMediaAttachments');

ok('Note with Document attachment → attachment upgraded to Image', () => {
  const note = {
    type: 'Note',
    content: '<p>Look at this cow!</p>',
    attachment: {
      type: 'Document',
      mediaType: 'image/jpeg',
      url: 'https://example.com/cow.jpg',
      name: 'A beautiful cow',
      width: 100,
      height: 162,
    },
  };
  const result = normalizeObjectMediaAttachments(note);
  assert.notStrictEqual(result, note);
  const att = result.attachment;
  assert.equal(att.type, 'Image');
  assert.equal(att.url, 'https://example.com/cow.jpg');
  assert.equal(att.name, 'A beautiful cow');
  assert.equal(att.width, 100);
  assert.equal(att.height, 162);
});

ok('Note with mixed attachments — media converted, OG Link preserved', () => {
  const note = {
    type: 'Note',
    content: '<p>Hello</p>',
    attachment: [
      { type: 'Document', mediaType: 'image/jpeg', url: 'https://example.com/photo.jpg' },
      { type: 'Link', mediaType: 'text/html', href: 'https://example.com/article', name: 'Article' },
    ],
  };
  const result = normalizeObjectMediaAttachments(note);
  const [img, link] = result.attachment;
  assert.equal(img.type, 'Image', 'Document → Image');
  assert.equal(link.type, 'Link', 'OG Link preserved');
  assert.equal(link.href, 'https://example.com/article', 'OG Link href preserved');
});

ok('Note with already-conformant Image → same reference returned', () => {
  const note = {
    type: 'Note',
    attachment: [{ type: 'Image', url: 'https://example.com/photo.jpg', mediaType: 'image/jpeg' }],
  };
  assert.strictEqual(normalizeObjectMediaAttachments(note), note);
});

ok('Note without attachment → same reference returned', () => {
  const note = { type: 'Note', content: '<p>No attachments</p>' };
  assert.strictEqual(normalizeObjectMediaAttachments(note), note);
});

ok('Array of three Document images → all converted to Image', () => {
  const note = {
    type: 'Note',
    attachment: [
      { type: 'Document', mediaType: 'image/jpeg', url: 'https://example.com/a.jpg' },
      { type: 'Document', mediaType: 'image/png', url: 'https://example.com/b.png' },
      { type: 'Document', mediaType: 'image/gif', url: 'https://example.com/c.gif' },
    ],
  };
  const result = normalizeObjectMediaAttachments(note);
  for (const att of result.attachment) {
    assert.equal(att.type, 'Image');
  }
  assert.equal(result.attachment[0].mediaType, 'image/jpeg');
  assert.equal(result.attachment[1].mediaType, 'image/png');
  assert.equal(result.attachment[2].mediaType, 'image/gif');
});

// ============================================================================
// § 8  MediaAttachmentsMiddleware integration
// ============================================================================
console.log('\n§ 8  MediaAttachmentsMiddleware integration');

ok('middleware passes through non-matching action names', async () => {
  const mw = MediaAttachmentsMiddleware();
  const next = handler => handler; // identity
  // For a non-matching action, localAction should return `next` unchanged
  const mockAction = { name: 'some.other.action' };
  const result = mw.localAction(next, mockAction);
  assert.strictEqual(result, next);
});

ok('middleware normalizes Document attachment on outbox Create/Note', async () => {
  const mw = MediaAttachmentsMiddleware();
  let captured = null;
  const handlerFn = async ctx => { captured = ctx.params; };
  const wrapped = mw.localAction(handlerFn, { name: 'activitypub.outbox.post' });

  const ctx = {
    params: {
      collectionUri: 'https://pods.test/alice/outbox',
      type: 'Create',
      object: {
        type: 'Note',
        content: '<p>Hello</p>',
        attachment: [
          { type: 'Document', mediaType: 'image/jpeg', url: 'https://example.com/photo.jpg', name: 'Alt text' },
        ],
      },
    },
  };

  await wrapped(ctx);

  const att = captured.object.attachment;
  // single attachment unwrapped from array
  const single = Array.isArray(att) ? att[0] : att;
  assert.equal(single.type, 'Image', 'Document → Image');
  assert.equal(single.url, 'https://example.com/photo.jpg');
  assert.equal(single.name, 'Alt text');
});

ok('middleware normalizes href→url on Image from extractMediaAttachmentLinks', async () => {
  const mw = MediaAttachmentsMiddleware();
  let captured = null;
  const handlerFn = async ctx => { captured = ctx.params; };
  const wrapped = mw.localAction(handlerFn, { name: 'activitypub.outbox.post' });

  const ctx = {
    params: {
      type: 'Create',
      object: {
        type: 'Note',
        content: '<p>See image</p>',
        // extractMediaAttachmentLinks produces href-keyed Image objects
        attachment: { type: 'Image', href: 'https://example.com/photo.jpg', mediaType: 'image/jpeg' },
      },
    },
  };

  await wrapped(ctx);

  const att = captured.object.attachment;
  assert.equal(att.url, 'https://example.com/photo.jpg', 'href migrated to url');
  assert.equal(att.href, undefined, 'href field removed');
});

ok('middleware normalizes on inbox.post (incoming Document image)', async () => {
  const mw = MediaAttachmentsMiddleware();
  let captured = null;
  const handlerFn = async ctx => { captured = ctx.params; };
  const wrapped = mw.localAction(handlerFn, { name: 'activitypub.inbox.post' });

  const ctx = {
    params: {
      type: 'Create',
      object: {
        type: 'Note',
        attachment: { type: 'Document', mediaType: 'image/webp', url: 'https://remote.example/img.webp' },
      },
    },
  };

  await wrapped(ctx);

  const att = captured.object.attachment;
  assert.equal(att.type, 'Image');
  assert.equal(att.mediaType, 'image/webp');
});

ok('middleware leaves OG Link attachment from LinkPreviewMiddleware unchanged', async () => {
  const mw = MediaAttachmentsMiddleware();
  let captured = null;
  const handlerFn = async ctx => { captured = ctx.params; };
  const wrapped = mw.localAction(handlerFn, { name: 'activitypub.outbox.post' });

  const ogLink = { type: 'Link', mediaType: 'text/html', href: 'https://example.com/page', name: 'Page Title' };
  const ctx = {
    params: {
      type: 'Create',
      object: {
        type: 'Note',
        content: '<p>Check this out</p>',
        attachment: [
          { type: 'Image', url: 'https://example.com/photo.jpg', mediaType: 'image/jpeg' },
          ogLink,
        ],
      },
    },
  };

  await wrapped(ctx);

  const [img, link] = captured.object.attachment;
  assert.equal(img.type, 'Image');
  assert.strictEqual(link, ogLink, 'OG Link unchanged (same reference)');
});

ok('middleware leaves activity unchanged when no attachment', async () => {
  const mw = MediaAttachmentsMiddleware();
  let captured = null;
  const handlerFn = async ctx => { captured = ctx.params; };
  const wrapped = mw.localAction(handlerFn, { name: 'activitypub.outbox.post' });

  const original = {
    type: 'Create',
    object: { type: 'Note', content: '<p>No attachments</p>' },
  };
  const ctx = { params: { ...original } };

  await wrapped(ctx);

  assert.deepEqual(captured, original);
});

// ============================================================================
// § 9  FEP-1311 reference example (full end-to-end)
// ============================================================================
console.log('\n§ 9  FEP-1311 reference example');

ok('FEP-1311 full Image object preserved as-is', () => {
  const item = {
    type: 'Image',
    name: 'A beautiful cow',
    url: 'https://example.com/cow.jpg',
    width: 100,
    height: 162,
    mediaType: 'image/jpeg',
    digestMultibase: 'zQmaeDPzhNL32WQZnnzB1H6QJWvvFNEHdViDB71yrxyXU1t',
    size: 9045,
  };
  // Already conformant — should be returned with same reference
  assert.strictEqual(normalizeMediaAttachment(item), item);
});

ok('FEP-1311 multi-version Video preserved as-is', () => {
  const item = {
    type: 'Video',
    name: 'A beautiful cow eating',
    url: [
      {
        type: 'Link',
        size: 54373,
        width: 256,
        height: 144,
        href: 'https://example.com/cow_eating.mp4',
        mediaType: 'video/mp4',
      },
      {
        type: 'Link',
        size: 2271723,
        width: 1920,
        height: 1080,
        href: 'https://example.com/cow_eating_hd.mp4',
        mediaType: 'video/mp4',
      },
    ],
    duration: 'PT3S',
  };
  assert.strictEqual(normalizeMediaAttachment(item), item);
});

// ============================================================================
// Done
// ============================================================================
console.log('');
if (failed > 0) {
  console.error(`${failed} assertion(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`fep_1311_media_attachments_proof_ok  (${passed} assertions)`);
