const assert = require('assert');
const {
  normalizeArticleObject,
  normalizeLongFormActivity,
  extractMediaAttachmentLinks
} = require('../utils/long-form-text');
const { normalizeActivityPubObjectHashtags } = require('../utils/hashtags');

const rawArticle = {
  type: 'Article',
  id: 'https://example.com/articles/1',
  name: '<h1>Long-form <em>Title</em></h1>',
  url: { type: 'Link', href: 'http://example.com/articles/1.html' },
  attributedTo: 'https://example.com/users/alice',
  summary: '<p>Intro <img src="https://example.com/inline-summary.png" /></p>',
  content:
    '<p>Hello <script>alert(1)</script>world</p>' +
    '<img src="https://example.com/media/hero.jpg" alt="hero" />' +
    '<video src="https://example.com/media/clip.mp4"></video>',
  published: '2026-04-03T00:00:00Z'
};

const normalized = normalizeArticleObject(rawArticle);

assert.strictEqual(normalized.type, 'Article');
assert.strictEqual(normalized.name, 'Long-form Title');
assert.ok(!normalized.content.includes('<script>'), 'content should strip script tags');
assert.ok(!normalized.summary.includes('<img'), 'summary should strip embedded media');
assert.ok(normalized.preview, 'preview should be generated for Article');
assert.strictEqual(normalized.preview.type, 'Note');
assert.ok(!normalized.preview.content.includes('Read more'), 'preview should not include a read-more link');
assert.ok(normalized.preview.content.includes('Long-form Title'), 'preview should include the article title');
assert.ok(normalized.preview.content.includes('Intro'), 'preview should include the article summary');

const extracted = extractMediaAttachmentLinks(normalized.content);
assert.ok(Array.isArray(extracted) && extracted.length >= 2, 'should extract media links from content');

const attachmentArray = Array.isArray(normalized.attachment) ? normalized.attachment : [normalized.attachment];
assert.ok(
  attachmentArray.some(att => att.href === 'https://example.com/media/hero.jpg'),
  'attachment should include image from content'
);
assert.ok(
  attachmentArray.some(att => att.href === 'https://example.com/media/clip.mp4'),
  'attachment should include video from content'
);

const createActivity = {
  type: 'Create',
  actor: 'https://example.com/users/alice',
  object: rawArticle
};

const normalizedActivity = normalizeLongFormActivity(createActivity);
assert.strictEqual(normalizedActivity.object.type, 'Article');
assert.ok(normalizedActivity.object.preview, 'Create.object should be normalized as Article');

const markdownArticle = normalizeArticleObject({
  type: 'Article',
  id: 'https://example.com/articles/md-1',
  attributedTo: 'https://example.com/users/alice',
  source: {
    mediaType: 'text/markdown',
    content: '## Heading\n\nA paragraph with #Fediverse and a [link](https://example.com).'
  }
});

assert.ok(markdownArticle.content.includes('<h2>Heading</h2>'), 'markdown should render heading');
assert.ok(markdownArticle.content.includes('class="mention hashtag"'), 'markdown hashtags should be linkified');
assert.ok(markdownArticle.content.includes('/tags/fediverse'), 'linkified hashtag should point to /tags/{tag}');

const mfmArticle = normalizeArticleObject({
  type: 'Article',
  id: 'https://example.com/articles/mfm-1',
  attributedTo: 'https://example.com/users/alice',
  source: {
    mediaType: 'text/x.misskeymarkdown',
    content: '$[x2 Big text] and #MFM'
  }
});

assert.ok(mfmArticle.content.includes('mfm-x2'), 'MFM operator should be preserved as classed span');
assert.ok(mfmArticle.content.includes('/tags/mfm'), 'MFM hashtags should be linkified');

const providedPreviewArticle = normalizeArticleObject({
  type: 'Article',
  id: 'https://example.com/articles/preview-1',
  attributedTo: 'https://example.com/users/alice',
  summary: '<p>Preview summary</p>',
  image: { type: 'Image', url: 'https://example.com/cover.png' },
  preview: {
    type: 'Note',
    content: '<p>Safe preview</p><a href="https://example.com/full">Read more</a><script>alert(1)</script>'
  }
});

assert.ok(!providedPreviewArticle.preview.content.includes('<a '), 'provided preview should strip links');
assert.ok(!providedPreviewArticle.preview.content.includes('<script>'), 'provided preview should strip scripts');
assert.deepStrictEqual(providedPreviewArticle.preview.attachment, {
  type: 'Image',
  url: 'https://example.com/cover.png'
});

const hashtagNormalized = normalizeActivityPubObjectHashtags({
  id: 'https://example.com/articles/tagged',
  type: 'Article',
  content: 'hello #InterOp'
});
const hashtagTag = Array.isArray(hashtagNormalized.tag)
  ? hashtagNormalized.tag.find(tag => tag.type === 'Hashtag' && tag.name === '#interop')
  : null;

assert.ok(hashtagTag, 'hashtag normalization should emit hashtag tag');
assert.strictEqual(hashtagTag.href, 'https://example.com/tags/interop', 'hashtag tag should include linkified href');

console.log('fep_b2b8_long_form_proof_ok');
