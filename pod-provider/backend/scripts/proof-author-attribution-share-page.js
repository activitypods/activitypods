'use strict';

const assert = require('node:assert/strict');

const {
  buildArticleShareUrl,
  buildFediverseCreatorHandle,
  renderArticleShareHtml,
  shouldBackfillArticleShareUrl,
  withPreferredArticleShareUrl
} = require('../utils/article-share');

const baseUrl = 'https://pod.example';
const objectUri = 'https://pod.example/posts/abc123';
const shareUrl = buildArticleShareUrl(baseUrl, objectUri);

assert.equal(shareUrl, 'https://pod.example/posts/abc123/share', 'share URL should derive from local post object URI');

const article = {
  id: objectUri,
  type: 'Article',
  attributedTo: 'https://pod.example/users/alice',
  name: 'An Article About Author Attribution',
  summary: '<p>A concise summary.</p>',
  content: '<p>Hello <strong>fediverse</strong>.</p>'
};

assert.equal(
  shouldBackfillArticleShareUrl(article, objectUri, shareUrl),
  true,
  'local Article without explicit HTML URL should be backfilled'
);

const patchedArticle = withPreferredArticleShareUrl(article, objectUri, shareUrl);
assert.deepEqual(patchedArticle.url, {
  type: 'Link',
  href: shareUrl,
  mediaType: 'text/html'
});

const actor = {
  id: 'https://pod.example/users/alice',
  type: 'Person',
  preferredUsername: 'alice',
  name: 'Alice Example',
  url: 'https://pod.example/@alice',
  attributionDomains: ['pod.example']
};

assert.equal(buildFediverseCreatorHandle(actor), '@alice@pod.example');

const html = renderArticleShareHtml({
  shareUrl,
  objectUri,
  article: patchedArticle,
  actor,
  instanceName: 'ActivityPods Test'
});

assert.match(html, /<meta name="fediverse:creator" content="@alice@pod\.example" \/>/, 'authorized local domain should emit fediverse:creator');
assert.match(html, /<meta property="og:title" content="An Article About Author Attribution" \/>/, 'share page should emit OpenGraph title');
assert.match(html, /<link rel="alternate" type="application\/activity\+json" href="https:\/\/pod\.example\/posts\/abc123" \/>/, 'share page should link back to AP JSON');

const unauthorizedHtml = renderArticleShareHtml({
  shareUrl: 'https://news.example/posts/abc123/share',
  objectUri,
  article: patchedArticle,
  actor,
  instanceName: 'ActivityPods Test'
});

assert.ok(
  !unauthorizedHtml.includes('fediverse:creator'),
  'unauthorized host must not emit fediverse:creator'
);

console.log('proof-author-attribution-share-page: ok');
