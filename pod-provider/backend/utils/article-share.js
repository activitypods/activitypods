'use strict';

const sanitizeHtml = require('sanitize-html');
const { getAttributionDomains, isAuthorizedAttributionDomain } = require('./author-attribution');
const { sanitizeLongFormContent } = require('./long-form-text');

const SUMMARY_ALLOWED_TAGS = ['p', 'span', 'br', 'a', 'em', 'strong', 'b', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'code'];
const SUMMARY_ALLOWED_ATTRIBUTES = {
  span: ['class'],
  a: ['href', 'rel', 'class'],
  ol: ['start', 'reversed'],
  li: ['value']
};

const asArray = value => (Array.isArray(value) ? value : value == null ? [] : [value]);

const asRecord = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

const sanitizeHttpUrl = value => {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const escapeHtml = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const stripHtml = value =>
  sanitizeHtml(typeof value === 'string' ? value : '', {
    allowedTags: [],
    allowedAttributes: {}
  })
    .replace(/\s+/g, ' ')
    .trim();

const sanitizeSummaryHtml = value => {
  if (typeof value !== 'string') return '';
  return sanitizeHtml(value, {
    allowedTags: SUMMARY_ALLOWED_TAGS,
    allowedAttributes: SUMMARY_ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https'],
    disallowedTagsMode: 'discard'
  });
};

const hasArticleType = value => {
  const record = asRecord(value);
  if (!record) return false;

  const rawTypes = asArray(record.type || record['@type']);
  return rawTypes.some(type => type === 'Article' || type === 'https://www.w3.org/ns/activitystreams#Article');
};

const extractPrimaryActorUri = article => {
  const record = asRecord(article);
  if (!record) return null;

  for (const value of asArray(record.attributedTo)) {
    if (typeof value === 'string') {
      const uri = sanitizeHttpUrl(value);
      if (uri) return uri;
      continue;
    }

    const nested = asRecord(value);
    if (!nested) continue;
    const uri = sanitizeHttpUrl(typeof nested.id === 'string' ? nested.id : nested['@id']);
    if (uri) return uri;
  }

  return null;
};

const extractFirstHttpUrl = value => {
  if (typeof value === 'string') {
    return sanitizeHttpUrl(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = extractFirstHttpUrl(item);
      if (resolved) return resolved;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  return (
    sanitizeHttpUrl(typeof record.href === 'string' ? record.href : null) ||
    sanitizeHttpUrl(typeof record.url === 'string' ? record.url : null) ||
    sanitizeHttpUrl(typeof record.id === 'string' ? record.id : null)
  );
};

const extractFirstImageUrl = article => {
  const record = asRecord(article);
  if (!record) return null;

  return (
    extractFirstHttpUrl(record.image) ||
    extractFirstHttpUrl(record.icon) ||
    extractFirstHttpUrl(record.preview && asRecord(record.preview)?.attachment)
  );
};

const extractPostIdFromObjectUri = objectUri => {
  const normalized = sanitizeHttpUrl(objectUri);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/^\/posts\/([^/]+)\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

const buildArticleShareUrl = (baseUrl, objectUri) => {
  const normalizedBase = sanitizeHttpUrl(baseUrl);
  const normalizedObject = sanitizeHttpUrl(objectUri);
  if (!normalizedBase || !normalizedObject) return null;

  const postId = extractPostIdFromObjectUri(normalizedObject);
  if (!postId) return null;

  try {
    const base = new URL(normalizedBase);
    const object = new URL(normalizedObject);
    if (base.origin !== object.origin) return null;
    return `${base.origin}/posts/${postId}/share`;
  } catch {
    return null;
  }
};

const normalizeUrlEntries = value => {
  if (typeof value === 'string') {
    const href = sanitizeHttpUrl(value);
    return href ? [{ href, mediaType: null, original: value }] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => normalizeUrlEntries(item));
  }

  const record = asRecord(value);
  if (!record) return [];

  const href = extractFirstHttpUrl(record);
  if (!href) return [];

  return [
    {
      href,
      mediaType: typeof record.mediaType === 'string' ? record.mediaType.trim().toLowerCase() : null,
      original: value
    }
  ];
};

const isHtmlEntry = entry => !entry.mediaType || entry.mediaType === 'text/html';

const shouldBackfillArticleShareUrl = (article, objectUri, shareUrl) => {
  const normalizedObject = sanitizeHttpUrl(objectUri);
  const normalizedShare = sanitizeHttpUrl(shareUrl);
  if (!normalizedObject || !normalizedShare || !hasArticleType(article)) return false;

  const entries = normalizeUrlEntries(asRecord(article)?.url);
  if (entries.length === 0) return true;
  if (entries.some(entry => entry.href === normalizedShare)) return false;

  const htmlEntries = entries.filter(isHtmlEntry);
  if (htmlEntries.length === 0) return true;

  return htmlEntries.every(entry => entry.href === normalizedObject);
};

const withPreferredArticleShareUrl = (article, objectUri, shareUrl) => {
  if (!hasArticleType(article)) return article;

  const normalizedObject = sanitizeHttpUrl(objectUri);
  const normalizedShare = sanitizeHttpUrl(shareUrl);
  if (!normalizedObject || !normalizedShare) return article;

  const currentValues = asArray(asRecord(article)?.url);
  const preserved = currentValues.filter(value => {
    const entries = normalizeUrlEntries(value);
    if (entries.length === 0) return value != null;

    return entries.every(entry => {
      if (!isHtmlEntry(entry)) return true;
      return entry.href !== normalizedObject && entry.href !== normalizedShare;
    });
  });

  const preferredLink = {
    type: 'Link',
    href: normalizedShare,
    mediaType: 'text/html'
  };

  return {
    ...article,
    url: preserved.length > 0 ? [preferredLink, ...preserved] : preferredLink
  };
};

const buildFediverseCreatorHandle = actor => {
  const record = asRecord(actor);
  if (!record) return null;

  const preferredUsername =
    typeof record.preferredUsername === 'string' ? record.preferredUsername.trim().replace(/^@+/, '') : '';
  const actorId = sanitizeHttpUrl(typeof record.id === 'string' ? record.id : record['@id']);
  if (!preferredUsername || !actorId) return null;

  try {
    const parsed = new URL(actorId);
    const host = parsed.hostname.toLowerCase();
    const authority = parsed.port ? `${host}:${parsed.port}` : host;
    return `@${preferredUsername}@${authority}`;
  } catch {
    return null;
  }
};

const formatIsoDate = value => {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const renderArticleShareHtml = ({ shareUrl, objectUri, article, actor, instanceName }) => {
  const normalizedShareUrl = sanitizeHttpUrl(shareUrl);
  const normalizedObjectUri = sanitizeHttpUrl(objectUri);
  if (!normalizedShareUrl || !normalizedObjectUri || !hasArticleType(article)) {
    throw new Error('renderArticleShareHtml requires a local Article and canonical URLs');
  }

  const shareLocation = new URL(normalizedShareUrl);
  const normalizedArticle = asRecord(article) || {};
  const normalizedActor = asRecord(actor);

  const title =
    stripHtml(normalizedArticle.name) ||
    stripHtml(normalizedArticle.summary) ||
    stripHtml(normalizedArticle.preview && asRecord(normalizedArticle.preview)?.content) ||
    stripHtml(normalizedArticle.content) ||
    'Article';

  const summaryHtml = sanitizeSummaryHtml(normalizedArticle.summary);
  const previewHtml = sanitizeSummaryHtml(asRecord(normalizedArticle.preview)?.content);
  const bodyHtml = sanitizeLongFormContent(typeof normalizedArticle.content === 'string' ? normalizedArticle.content : '');
  const description =
    stripHtml(normalizedArticle.summary) ||
    stripHtml(asRecord(normalizedArticle.preview)?.content) ||
    stripHtml(normalizedArticle.content) ||
    title;

  const authorName =
    stripHtml(normalizedActor?.name) ||
    buildFediverseCreatorHandle(normalizedActor) ||
    stripHtml(normalizedActor?.preferredUsername) ||
    'Unknown author';
  const authorUrl =
    extractFirstHttpUrl(normalizedActor?.url) ||
    sanitizeHttpUrl(typeof normalizedActor?.id === 'string' ? normalizedActor.id : normalizedActor?.['@id']) ||
    null;
  const previewImageUrl = extractFirstImageUrl(normalizedArticle);

  const fediverseCreator = buildFediverseCreatorHandle(normalizedActor);
  const emitFediverseCreator =
    fediverseCreator &&
    isAuthorizedAttributionDomain(shareLocation.hostname, getAttributionDomains(normalizedActor));

  const siteName = stripHtml(instanceName) || shareLocation.hostname;
  const published = formatIsoDate(normalizedArticle.published);
  const updated = formatIsoDate(normalizedArticle.updated);
  const sensitive = normalizedArticle.sensitive === true;

  const renderedBody = bodyHtml || previewHtml || (summaryHtml ? `<div class="summary">${summaryHtml}</div>` : '');
  const renderedSummary = summaryHtml ? `<div class="summary">${summaryHtml}</div>` : '';
  const renderedImage = previewImageUrl
    ? `<figure class="hero"><img src="${escapeHtml(previewImageUrl)}" alt="" loading="eager" decoding="async" /></figure>`
    : '';
  const renderedAuthor = authorUrl
    ? `<a class="byline-link" href="${escapeHtml(authorUrl)}" rel="author external noopener noreferrer">${escapeHtml(authorName)}</a>`
    : `<span class="byline-link">${escapeHtml(authorName)}</span>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description.slice(0, 500))}" />
  <meta name="author" content="${escapeHtml(authorName)}" />
  <link rel="canonical" href="${escapeHtml(normalizedShareUrl)}" />
  <link rel="alternate" type="application/activity+json" href="${escapeHtml(normalizedObjectUri)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(normalizedShareUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description.slice(0, 500))}" />
  <meta property="og:site_name" content="${escapeHtml(siteName)}" />
  ${previewImageUrl ? `<meta property="og:image" content="${escapeHtml(previewImageUrl)}" />` : ''}
  ${published ? `<meta property="article:published_time" content="${escapeHtml(published)}" />` : ''}
  ${updated ? `<meta property="article:modified_time" content="${escapeHtml(updated)}" />` : ''}
  ${emitFediverseCreator ? `<meta name="fediverse:creator" content="${escapeHtml(fediverseCreator)}" />` : ''}
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif; background: #f7f3ec; color: #1f1b16; }
    main { max-width: 880px; margin: 0 auto; padding: 40px 20px 80px; }
    article { background: rgba(255,255,255,0.94); border: 1px solid rgba(58,41,24,0.12); border-radius: 24px; padding: 32px; box-shadow: 0 18px 60px rgba(41, 27, 15, 0.08); }
    .eyebrow { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; color: #6f5a45; font: 600 0.78rem/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
    .chip { border-radius: 999px; padding: 0.3rem 0.7rem; background: rgba(146, 109, 63, 0.11); }
    h1 { margin: 0 0 12px; font-size: clamp(2rem, 4vw, 3.6rem); line-height: 1.03; letter-spacing: -0.02em; }
    .lede, .summary { font-size: 1.04rem; line-height: 1.75; color: #4d4033; }
    .byline { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin: 0 0 28px; font: 500 0.98rem/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #5f503f; }
    .byline-link { color: inherit; text-decoration: underline; text-underline-offset: 0.18em; }
    .hero { margin: 0 0 28px; }
    .hero img { width: 100%; height: auto; display: block; border-radius: 18px; background: #ece4d7; }
    .warning { margin: 0 0 20px; border-left: 4px solid #b45309; padding: 12px 16px; border-radius: 12px; background: #fff7ed; color: #7c2d12; font: 600 0.95rem/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .content { margin-top: 28px; font-size: 1.06rem; line-height: 1.85; color: #201913; }
    .content :is(h2, h3, h4, h5, h6) { margin: 2.1em 0 0.7em; line-height: 1.2; }
    .content p, .content ul, .content ol, .content pre, .content blockquote { margin: 1em 0; }
    .content blockquote { border-left: 4px solid rgba(111, 90, 69, 0.28); margin-left: 0; padding-left: 1rem; color: #5a4b3c; }
    .content pre { overflow-x: auto; padding: 1rem; border-radius: 14px; background: #17120d; color: #f5efe6; }
    .content code { font-size: 0.92em; }
    .content a { color: #7c3f00; text-decoration-thickness: 0.08em; text-underline-offset: 0.16em; }
    .content img, .content video, .content audio { max-width: 100%; border-radius: 14px; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(58,41,24,0.12); font: 500 0.94rem/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #6f5a45; }
    .footer a { color: inherit; }
    @media (max-width: 720px) {
      main { padding: 16px 12px 40px; }
      article { padding: 20px; border-radius: 18px; }
    }
  </style>
</head>
<body>
  <main>
    <article>
      <div class="eyebrow">
        <span class="chip">${escapeHtml(siteName)}</span>
        <span>${published ? escapeHtml(new Date(published).toLocaleDateString('en-US', { dateStyle: 'medium' })) : 'Published from the fediverse'}</span>
      </div>
      <h1>${escapeHtml(title)}</h1>
      <p class="byline">By ${renderedAuthor}</p>
      ${sensitive ? '<div class="warning">Sensitive content warning: the author marked this article as sensitive.</div>' : ''}
      ${renderedSummary}
      ${renderedImage}
      <div class="content">${renderedBody}</div>
      <p class="footer">ActivityPub JSON: <a href="${escapeHtml(normalizedObjectUri)}" rel="alternate">view source</a></p>
    </article>
  </main>
</body>
</html>`;
};

module.exports = {
  buildArticleShareUrl,
  buildFediverseCreatorHandle,
  extractFirstHttpUrl,
  extractFirstImageUrl,
  extractPostIdFromObjectUri,
  extractPrimaryActorUri,
  hasArticleType,
  renderArticleShareHtml,
  shouldBackfillArticleShareUrl,
  withPreferredArticleShareUrl
};
