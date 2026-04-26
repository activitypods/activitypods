'use strict';

/**
 * AP-side OpenGraph + Link Preview Proof Script
 *
 * Validates without a running Moleculer broker or remote network:
 *
 *   1. fetchOpenGraph() — null on bad URLs, parses OG tags from local server
 *   2. Author attribution resolution — fediverse:creator → verified preview authors
 *   3. extractFirstPreviewUrl() — prefers attached Link hrefs before Note source/content
 *   4. enrichNoteWithLinkPreview() — attaches OG as FEP-8967 ActivityStreams Link
 *   5. buildLinkPreviewAttachment() — correct AS2 Link + preview shape
 *   6. LinkPreviewMiddleware — skips non-Note activities, enriches Notes
 *
 * Usage:
 *   node scripts/proof-ap-link-preview-og.js
 */

const assert = require('assert');
const http = require('http');
const { fetchOpenGraph } = require('../utils/opengraph');
const { normalizeActorAuthorAttributionForOutput } = require('../utils/author-attribution');
const {
  extractFirstPreviewUrl,
  enrichNoteWithLinkPreview,
  buildLinkPreviewAttachment
} = require('../middlewares/link-preview');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const startServer = (html, statusCode = 200, contentType = 'text/html; charset=utf-8') =>
  new Promise(resolve => {
    const server = http.createServer((_req, res) => {
      res.writeHead(statusCode, { 'Content-Type': contentType });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

const stopServer = server => new Promise(resolve => server.close(() => resolve()));

const serverUrl = server => `http://127.0.0.1:${server.address().port}/page`;

const startRouterServer = handler =>
  new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

async function run() {
  process.env.ALLOW_PRIVATE_PREVIEW_FETCHES = '1';

  // ---------------------------------------------------------------------------
  // § 1  fetchOpenGraph() — failure paths
  // ---------------------------------------------------------------------------

  {
    const ogNull = await fetchOpenGraph('not-a-url');
    assert.strictEqual(ogNull, null, 'non-URL → null');

    const ogFtp = await fetchOpenGraph('ftp://example.com/');
    assert.strictEqual(ogFtp, null, 'ftp:// → null');

    const server404 = await startServer('', 404);
    try {
      const og404 = await fetchOpenGraph(serverUrl(server404));
      assert.strictEqual(og404, null, '404 response → null');
    } finally {
      await stopServer(server404);
    }

    const serverJson = await startServer('{"key":"val"}', 200, 'application/json');
    try {
      const ogJson = await fetchOpenGraph(serverUrl(serverJson));
      assert.strictEqual(ogJson, null, 'JSON content-type → null');
    } finally {
      await stopServer(serverJson);
    }

    console.log('  [ok] fetchOpenGraph failure paths');
  }

  // § 1b  fetchOpenGraph() — success path
  {
    const html = `<!DOCTYPE html><html><head>
    <meta property="og:title" content="My Page Title" />
    <meta property="og:description" content="A page description." />
    <meta property="og:image" content="https://example.com/thumb.png" />
    <meta property="og:url" content="https://example.com/canonical" />
  </head><body>content</body></html>`;

    const server = await startServer(html);
    try {
      const og = await fetchOpenGraph(serverUrl(server));
      assert.ok(og !== null, 'valid page → non-null result');
      assert.strictEqual(og.title, 'My Page Title', 'og:title extracted');
      assert.strictEqual(og.description, 'A page description.', 'og:description extracted');
      assert.strictEqual(og.thumbUrl, 'https://example.com/thumb.png', 'og:image extracted');
      assert.strictEqual(og.uri, 'https://example.com/canonical', 'og:url used as canonical uri');
      console.log('  [ok] fetchOpenGraph success path');
    } finally {
      await stopServer(server);
    }
  }

  // § 1c  fetchOpenGraph() — fallback to <title> and meta[name=description]
  {
    const html = `<html><head>
    <title>Fallback Title</title>
    <meta name="description" content="Fallback description." />
  </head><body></body></html>`;

    const server = await startServer(html);
    try {
      const og = await fetchOpenGraph(serverUrl(server));
      assert.ok(og !== null, 'title-only page → non-null result');
      assert.strictEqual(og.title, 'Fallback Title', '<title> fallback');
      assert.strictEqual(og.description, 'Fallback description.', 'meta[name=description] fallback');
      console.log('  [ok] fetchOpenGraph <title> + meta[name] fallback');
    } finally {
      await stopServer(server);
    }
  }

  // ---------------------------------------------------------------------------
  // § 1d  actor attribution output normalization
  // ---------------------------------------------------------------------------

  {
    const actor = normalizeActorAuthorAttributionForOutput({
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Person',
      id: 'https://social.example/users/alice',
      attributionDomains: ['Example.com', 'news.example.com', 'example.com']
    });

    assert.deepStrictEqual(
      actor.attributionDomains,
      ['example.com', 'news.example.com'],
      'actor attribution domains normalized and deduplicated'
    );
    assert.ok(Array.isArray(actor['@context']), 'author attribution context added');
    assert.ok(
      actor['@context'].some(entry => entry?.attributionDomains === 'toot:attributionDomains'),
      'Mastodon attributionDomains context mapping added'
    );

    console.log('  [ok] author attribution actor normalization');
  }

  // ---------------------------------------------------------------------------
  // § 1e  fetchOpenGraph() — Mastodon author attribution
  // ---------------------------------------------------------------------------

  {
    let actorDocumentHits = 0;
    const server = await startRouterServer((req, res) => {
      if (req.url === '/page') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head>
          <meta property="og:title" content="Verified Story" />
          <meta property="og:description" content="Byline-aware story preview." />
          <meta name="fediverse:creator" content="@alice@127.0.0.1:${server.address().port}" />
        </head><body>story</body></html>`);
        return;
      }

      if (req.url && req.url.startsWith('/.well-known/webfinger?')) {
        res.writeHead(200, { 'Content-Type': 'application/jrd+json' });
        res.end(
          JSON.stringify({
            subject: `acct:alice@127.0.0.1:${server.address().port}`,
            links: [
              {
                rel: 'self',
                type: 'application/activity+json',
                href: `http://127.0.0.1:${server.address().port}/users/alice`
              },
              {
                rel: 'http://webfinger.net/rel/profile-page',
                href: `http://127.0.0.1:${server.address().port}/@alice`
              }
            ]
          })
        );
        return;
      }

      if (req.url === '/users/alice') {
        actorDocumentHits += 1;
        res.writeHead(200, { 'Content-Type': 'application/activity+json' });
        res.end(
          JSON.stringify({
            '@context': [
              'https://www.w3.org/ns/activitystreams',
              {
                toot: 'http://joinmastodon.org/ns#',
                attributionDomains: 'toot:attributionDomains'
              }
            ],
            type: 'Person',
            id: `http://127.0.0.1:${server.address().port}/users/alice`,
            name: 'Alice Example',
            url: `http://127.0.0.1:${server.address().port}/@alice`,
            icon: {
              type: 'Image',
              url: `http://127.0.0.1:${server.address().port}/media/alice.png`
            },
            attributionDomains: ['127.0.0.1']
          })
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    });

    try {
      const og = await fetchOpenGraph(serverUrl(server));
      assert.ok(og, 'author-attributed page resolves OG metadata');
      assert.strictEqual(og.authorName, 'Alice Example', 'primary author name set');
      assert.strictEqual(og.authorUrl, `http://127.0.0.1:${server.address().port}/@alice`, 'primary author URL set');
      assert.ok(Array.isArray(og.authors) && og.authors.length === 1, 'authors array populated');
      assert.strictEqual(og.authors[0].verificationState, 'verified', 'author marked verified');
      assert.strictEqual(og.authors[0].verificationReason, 'domain_authorized', 'verification reason preserved');
      assert.strictEqual(actorDocumentHits, 1, 'actor document resolved exactly once');

      const attachment = buildLinkPreviewAttachment(og);
      assert.strictEqual(attachment.authorName, 'Alice Example', 'attachment keeps authorName');
      assert.strictEqual(
        attachment.authorUrl,
        `http://127.0.0.1:${server.address().port}/@alice`,
        'attachment keeps authorUrl'
      );
      assert.ok(Array.isArray(attachment.authors) && attachment.authors.length === 1, 'attachment keeps authors array');

      console.log('  [ok] fetchOpenGraph author attribution + Link attachment preservation');
    } finally {
      await stopServer(server);
    }
  }

  // ---------------------------------------------------------------------------
  // § 2  extractFirstPreviewUrl()
  // ---------------------------------------------------------------------------

  {
    const note0 = {
      type: 'Note',
      content: '<p>Inline https://example.com/body-link</p>',
      attachment: {
        type: 'Link',
        href: 'https://example.com/attached-link'
      }
    };
    assert.strictEqual(
      extractFirstPreviewUrl(note0),
      'https://example.com/attached-link',
      'explicit Link attachment wins'
    );

    // From source.content plain text
    const note1 = {
      type: 'Note',
      source: { mediaType: 'text/plain', content: 'Check this out https://example.com/article' }
    };
    assert.strictEqual(extractFirstPreviewUrl(note1), 'https://example.com/article', 'URL from source.content');

    // From source.content Markdown
    const note2 = {
      type: 'Note',
      source: { mediaType: 'text/markdown', content: '[link](https://example.com/md-article) foo' }
    };
    // Raw URL scan won't find Markdown []() links — it scans for bare https://...
    // Plain text URLs in Markdown:
    const note2b = {
      type: 'Note',
      source: { mediaType: 'text/markdown', content: 'See https://example.com/md-article for details' }
    };
    assert.strictEqual(
      extractFirstPreviewUrl(note2b),
      'https://example.com/md-article',
      'URL from Markdown source.content'
    );

    // From rendered HTML <a href>
    const note3 = {
      type: 'Note',
      content: '<p>Visit <a href="https://external.example/page">this page</a></p>'
    };
    assert.strictEqual(
      extractFirstPreviewUrl(note3),
      'https://external.example/page',
      'URL from content HTML <a href>'
    );

    // Skip hashtag links
    const note4 = {
      type: 'Note',
      source: {
        mediaType: 'text/plain',
        content: 'Tagged #rust https://pods.example/tags/rust and https://real.com/page'
      }
    };
    assert.strictEqual(extractFirstPreviewUrl(note4), 'https://real.com/page', 'skip /tags/ links, use real URL');

    // Skip mention links (in HTML)
    const note5 = {
      type: 'Note',
      content:
        '<a href="https://mastodon.social/users/alice">@alice</a> see <a href="https://news.example/story">this</a>'
    };
    assert.strictEqual(extractFirstPreviewUrl(note5), 'https://news.example/story', 'skip /users/ links in HTML');

    // No URL → null
    const note6 = { type: 'Note', content: '<p>hello world</p>' };
    assert.strictEqual(extractFirstPreviewUrl(note6), null, 'no URL → null');

    // Trailing punctuation stripped
    const note7 = {
      type: 'Note',
      source: { mediaType: 'text/plain', content: 'See https://example.com/article.' }
    };
    assert.strictEqual(extractFirstPreviewUrl(note7), 'https://example.com/article', 'trailing dot stripped');

    console.log('  [ok] extractFirstPreviewUrl');
  }

  // ---------------------------------------------------------------------------
  // § 3  buildLinkPreviewAttachment()
  // ---------------------------------------------------------------------------

  {
    const full = buildLinkPreviewAttachment({
      uri: 'https://example.com/page',
      title: 'Page Title',
      description: 'A short description.',
      thumbUrl: 'https://example.com/thumb.jpg'
    });
    assert.strictEqual(full.type, 'Link', 'type is Link');
    assert.strictEqual(full.mediaType, 'text/html', 'mediaType is text/html');
    assert.strictEqual(full.href, 'https://example.com/page', 'href matches uri');
    assert.strictEqual(full.name, 'Page Title', 'name is title');
    assert.strictEqual(full.summary, 'A short description.', 'summary is description');
    assert.deepStrictEqual(full.icon, { type: 'Image', url: 'https://example.com/thumb.jpg' }, 'icon built');
    assert.deepStrictEqual(
      full.preview,
      {
        type: 'Article',
        name: 'Page Title',
        summary: 'A short description.',
        image: { type: 'Image', url: 'https://example.com/thumb.jpg' }
      },
      'preview object built'
    );

    // No description, no thumb
    const minimal = buildLinkPreviewAttachment({
      uri: 'https://example.com/page',
      title: 'Minimal Title'
    });
    assert.ok(!minimal.summary, 'no summary when no description');
    assert.ok(!minimal.icon, 'no icon when no thumbUrl');
    assert.deepStrictEqual(minimal.preview, { type: 'Article', name: 'Minimal Title' }, 'minimal preview included');

    console.log('  [ok] buildLinkPreviewAttachment');
  }

  // ---------------------------------------------------------------------------
  // § 4  enrichNoteWithLinkPreview()
  // ---------------------------------------------------------------------------

  {
    const baseNote = {
      type: 'Note',
      id: 'https://pods.test/notes/1',
      content: '<p>Hello</p>'
    };
    const ogData = { uri: 'https://example.com/page', title: 'Page', description: 'Desc.', thumbUrl: null };

    const enriched = enrichNoteWithLinkPreview(baseNote, ogData);
    const attachment = Array.isArray(enriched.attachment) ? enriched.attachment[0] : enriched.attachment;
    assert.ok(attachment, 'attachment added');
    assert.strictEqual(attachment.type, 'Link', 'attachment type is Link');
    assert.strictEqual(attachment.href, 'https://example.com/page', 'attachment href');
    assert.strictEqual(attachment.name, 'Page', 'attachment name');
    assert.deepStrictEqual(
      attachment.preview,
      { type: 'Article', name: 'Page', summary: 'Desc.' },
      'attachment preview'
    );

    // No double-add
    const enrichedAgain = enrichNoteWithLinkPreview(enriched, ogData);
    const attachments2 = Array.isArray(enrichedAgain.attachment)
      ? enrichedAgain.attachment
      : [enrichedAgain.attachment];
    const linkCount = attachments2.filter(a => a && a.type === 'Link' && a.href === ogData.uri).length;
    assert.strictEqual(linkCount, 1, 'no duplicate Link attachment on re-enrich');

    // Merges with existing attachments
    const noteWithAttachment = {
      ...baseNote,
      attachment: { type: 'Image', url: 'https://pods.test/img/1.jpg' }
    };
    const enrichedWithImage = enrichNoteWithLinkPreview(noteWithAttachment, ogData);
    const mergedArr = Array.isArray(enrichedWithImage.attachment)
      ? enrichedWithImage.attachment
      : [enrichedWithImage.attachment];
    assert.strictEqual(mergedArr.length, 2, 'existing Image + new Link = 2 attachments');
    assert.ok(
      mergedArr.some(a => a.type === 'Image'),
      'existing Image preserved'
    );
    assert.ok(
      mergedArr.some(a => a.type === 'Link'),
      'new Link added'
    );

    const noteWithPublisherCard = {
      ...baseNote,
      attachment: {
        type: 'Link',
        href: 'https://example.com/page',
        name: 'Publisher Title'
      }
    };
    const preservedPublisherCard = enrichNoteWithLinkPreview(noteWithPublisherCard, ogData);
    const preservedAttachment = Array.isArray(preservedPublisherCard.attachment)
      ? preservedPublisherCard.attachment[0]
      : preservedPublisherCard.attachment;
    assert.strictEqual(preservedAttachment.name, 'Publisher Title', 'publisher-provided name preserved');
    assert.ok(!preservedAttachment.preview, 'publisher-provided attachment not overwritten');

    console.log('  [ok] enrichNoteWithLinkPreview');
  }

  // ---------------------------------------------------------------------------
  // § 5  LinkPreviewMiddleware — integration (invoke enrichActivity path via
  //       local mock server for full round-trip)
  // ---------------------------------------------------------------------------

  {
    const ogHtml = `<html><head>
    <meta property="og:title" content="Linked Story" />
    <meta property="og:description" content="Story description." />
    <meta property="og:image" content="https://news.example/thumb.jpg" />
  </head><body></body></html>`;

    const server = await startServer(ogHtml);
    const linkUrl = serverUrl(server);

    try {
      // Simulate what the middleware does: enrichActivity is not exported, but we
      // can test the full round-trip by invoking the middleware handler directly.
      const LinkPreviewMiddleware = require('../middlewares/link-preview');
      const middleware = LinkPreviewMiddleware();

      // Build a dummy next that captures ctx.params
      let capturedParams = null;
      const dummyNext = async ctx => {
        capturedParams = ctx.params;
        return 'ok';
      };

      // Build a fake action descriptor (outbox.post)
      const outboxAction = { name: 'activitypub.outbox.post' };
      const wrappedHandler = middleware.localAction(dummyNext, outboxAction);

      const ctx = {
        params: {
          collectionUri: 'https://pods.test/users/alice/outbox',
          type: 'Create',
          actor: 'https://pods.test/users/alice',
          object: {
            type: 'Note',
            id: 'https://pods.test/notes/2',
            content: `<p>Check this out <a href="${linkUrl}">article</a></p>`
          }
        }
      };

      await wrappedHandler(ctx);

      assert.ok(capturedParams, 'next was called with params');
      const note = capturedParams.object;
      const att = Array.isArray(note.attachment) ? note.attachment[0] : note.attachment;
      assert.ok(att, 'attachment added to Note');
      assert.strictEqual(att.type, 'Link', 'attachment type is Link');
      assert.strictEqual(att.href, linkUrl, 'href matches fetched URL');
      assert.strictEqual(att.name, 'Linked Story', 'OG title in attachment.name');
      assert.strictEqual(att.summary, 'Story description.', 'OG description in attachment.summary');
      assert.deepStrictEqual(
        att.icon,
        { type: 'Image', url: 'https://news.example/thumb.jpg' },
        'OG image in attachment.icon'
      );
      assert.strictEqual(
        capturedParams.collectionUri,
        'https://pods.test/users/alice/outbox',
        'collectionUri preserved'
      );

      console.log('  [ok] LinkPreviewMiddleware full round-trip (Create+Note, outbox)');
    } finally {
      await stopServer(server);
    }

    // Inbox post → passthrough without enrichment
    {
      const middleware = require('../middlewares/link-preview')();
      let capturedParams = null;
      const dummyNext = async ctx => {
        capturedParams = ctx.params;
        return 'ok';
      };
      const inboxAction = { name: 'activitypub.inbox.post' };
      const wrappedInbox = middleware.localAction(dummyNext, inboxAction);

      const ctx = {
        params: {
          type: 'Create',
          object: { type: 'Note', content: '<p>Hi</p>' }
        }
      };
      await wrappedInbox(ctx);
      assert.ok(!capturedParams.object.attachment, 'inbox post: no attachment added');
      console.log('  [ok] LinkPreviewMiddleware inbox passthrough');
    }

    // Activity with no Note → passthrough
    {
      const middleware = require('../middlewares/link-preview')();
      let capturedParams = null;
      const dummyNext = async ctx => {
        capturedParams = ctx.params;
        return 'ok';
      };
      const outboxAction = { name: 'activitypub.outbox.post' };
      const wrappedHandler = middleware.localAction(dummyNext, outboxAction);

      const ctx = {
        params: {
          type: 'Follow',
          actor: 'https://pods.test/users/alice',
          object: 'https://other.example/users/bob'
        }
      };
      await wrappedHandler(ctx);
      assert.ok(!capturedParams.attachment, 'Follow activity: no attachment added');
      console.log('  [ok] LinkPreviewMiddleware non-Note passthrough');
    }
  }

  // ---------------------------------------------------------------------------
  // Done
  // ---------------------------------------------------------------------------

  console.log('\nap_side_link_preview_og_proof_ok');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
