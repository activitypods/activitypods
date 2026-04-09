'use strict';

const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');
const { deriveHashtagBaseUrl, linkifyHashtagsInHtml } = require('./hashtags');

const ARTICLE_TYPE = 'Article';
const NOTE_TYPE = 'Note';

const FEP_B2B8_ALLOWED_TAGS = [
  'p',
  'span',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'br',
  'a',
  'del',
  'pre',
  'code',
  'em',
  'strong',
  'b',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'blockquote',
  'img',
  'video',
  'audio',
  'source',
  'ruby',
  'rt',
  'rp',
];

const FEP_B2B8_ALLOWED_ATTRIBUTES = {
  span: ['class'],
  a: ['href', 'rel', 'class'],
  ol: ['start', 'reversed'],
  li: ['value'],
  img: ['src', 'alt', 'title', 'width', 'height', 'class'],
  video: ['src', 'controls', 'loop', 'poster', 'width', 'height', 'class'],
  audio: ['src', 'controls', 'loop', 'class'],
  source: ['src', 'type'],
};

const SUMMARY_ALLOWED_TAGS = [
  'p',
  'span',
  'br',
  'a',
  'em',
  'strong',
  'b',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
];

const SUMMARY_ALLOWED_ATTRIBUTES = {
  span: ['class'],
  a: ['href', 'rel', 'class'],
  ol: ['start', 'reversed'],
  li: ['value'],
};

const URL_RE = /^https?:\/\//i;
const HTTPS_RE = /^https:\/\//i;

const MARKDOWN_MEDIA_TYPES = new Set([
  'text/markdown',
  'text/x-markdown',
  'text/plain+markdown',
]);

const MFM_MEDIA_TYPES = new Set([
  'text/x.misskeymarkdown',
  'text/x-misskey-markdown',
  'text/mfm',
]);

const markdownRenderer = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
});

const toArray = value => (Array.isArray(value) ? value : value ? [value] : []);

const safeType = value => (typeof value === 'string' ? value : '');

const normalizeMediaType = value =>
  typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : '';

const detectContentFormat = object => {
  if (!object || typeof object !== 'object') {
    return { kind: 'html', value: object?.content };
  }

  const source = object.source && typeof object.source === 'object' ? object.source : null;
  const sourceType = normalizeMediaType(source?.mediaType);
  const objectType = normalizeMediaType(object.mediaType);

  if (source && typeof source.content === 'string') {
    if (MFM_MEDIA_TYPES.has(sourceType)) {
      return { kind: 'mfm', value: source.content };
    }
    if (MARKDOWN_MEDIA_TYPES.has(sourceType)) {
      return { kind: 'markdown', value: source.content };
    }
  }

  if (typeof object.content === 'string') {
    if (MFM_MEDIA_TYPES.has(objectType)) {
      return { kind: 'mfm', value: object.content };
    }
    if (MARKDOWN_MEDIA_TYPES.has(objectType)) {
      return { kind: 'markdown', value: object.content };
    }
  }

  return { kind: 'html', value: object.content };
};

const preprocessMisskeyFlavoredMarkdown = input => {
  if (typeof input !== 'string') {
    return input;
  }

  // Minimal but useful MFM support (styling operators) while staying safe.
  // $[x2 text] -> <span class="mfm-x2">text</span>
  // $[center text] -> <span class="mfm-center">text</span>
  return input.replace(/\$\[([A-Za-z0-9_-]+)\s+([^\]]+)]/g, (_all, op, text) => {
    const opClass = String(op).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return `<span class="mfm-${opClass}">${text}</span>`;
  });
};

const renderRichTextToHtml = (object, raw, kind) => {
  if (typeof raw !== 'string') {
    return raw;
  }

  let html = raw;
  if (kind === 'markdown' || kind === 'mfm') {
    const markdownInput = kind === 'mfm' ? preprocessMisskeyFlavoredMarkdown(raw) : raw;
    html = markdownRenderer.render(markdownInput);
  }

  const baseUrl = deriveHashtagBaseUrl(object);
  return linkifyHashtagsInHtml(html, { baseUrl });
};

const normalizeName = value => {
  if (typeof value !== 'string') return value;

  const noMarkup = sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
  if (!noMarkup) return undefined;

  // Keep stream cards compact while preserving meaningful titles.
  return noMarkup.length > 160 ? `${noMarkup.slice(0, 157)}...` : noMarkup;
};

const sanitizeSummary = value => {
  if (typeof value !== 'string') return value;
  return sanitizeHtml(value, {
    allowedTags: SUMMARY_ALLOWED_TAGS,
    allowedAttributes: SUMMARY_ALLOWED_ATTRIBUTES,
    disallowedTagsMode: 'discard',
    allowedSchemes: ['http', 'https'],
  });
};

const sanitizeLongFormContent = value => {
  if (typeof value !== 'string') return value;

  return sanitizeHtml(value, {
    allowedTags: FEP_B2B8_ALLOWED_TAGS,
    allowedAttributes: FEP_B2B8_ALLOWED_ATTRIBUTES,
    disallowedTagsMode: 'discard',
    allowedSchemes: ['http', 'https'],
  });
};

const normalizeLinkValue = item => {
  if (typeof item === 'string') {
    if (!URL_RE.test(item)) return null;
    return item;
  }

  if (!item || typeof item !== 'object') return null;

  if (item.type === 'Link' || item.href || item.mediaType) {
    const href = typeof item.href === 'string' && URL_RE.test(item.href) ? item.href : null;
    if (!href) return null;

    const normalized = { ...item, type: item.type || 'Link', href };
    return normalized;
  }

  return null;
};

const hasHtmlRepresentation = url => {
  const links = toArray(url).map(normalizeLinkValue).filter(Boolean);
  if (links.length === 0) return false;

  return links.some(link => {
    if (typeof link === 'string') {
      return HTTPS_RE.test(link);
    }
    return HTTPS_RE.test(link.href) && (link.mediaType === 'text/html' || !link.mediaType);
  });
};

const normalizeArticleUrl = (url, fallbackId) => {
  const normalized = toArray(url).map(normalizeLinkValue).filter(Boolean);

  if (normalized.length === 0 && typeof fallbackId === 'string' && HTTPS_RE.test(fallbackId)) {
    return fallbackId;
  }

  if (normalized.length === 0) {
    return url;
  }

  if (!hasHtmlRepresentation(normalized) && typeof fallbackId === 'string' && HTTPS_RE.test(fallbackId)) {
    normalized.unshift({ type: 'Link', href: fallbackId, mediaType: 'text/html' });
  }

  return normalized.length === 1 ? normalized[0] : normalized;
};

const inferMediaType = src => {
  if (typeof src !== 'string') return undefined;

  const lower = src.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return undefined;
};

const extractMediaAttachmentLinks = html => {
  if (typeof html !== 'string' || html.length === 0) return [];

  const found = new Map();
  const mediaRe = /<(img|video|audio|source)\b[^>]*\s(?:src)=['"]([^'"]+)['"][^>]*>/gi;

  let match;
  while ((match = mediaRe.exec(html)) !== null) {
    const tagName = match[1]?.toLowerCase();
    const src = match[2];

    if (!src || !URL_RE.test(src) || found.has(src)) continue;

    const type = tagName === 'img' ? 'Image' : tagName === 'video' ? 'Video' : 'Audio';
    found.set(src, {
      type,
      href: src,
      mediaType: inferMediaType(src),
    });
  }

  return Array.from(found.values());
};

const normalizeAttachment = item => {
  if (typeof item === 'string') {
    if (!URL_RE.test(item)) return null;
    return { type: 'Link', href: item, mediaType: inferMediaType(item) };
  }

  if (!item || typeof item !== 'object') return null;

  if (typeof item.href === 'string' && URL_RE.test(item.href)) {
    return { ...item, type: item.type || 'Link', mediaType: item.mediaType || inferMediaType(item.href) };
  }

  if (typeof item.id === 'string' && URL_RE.test(item.id)) {
    return { ...item, id: item.id, type: item.type || 'Link', mediaType: item.mediaType || inferMediaType(item.id) };
  }

  return null;
};

const mergeAttachments = (existing, fromContent) => {
  const merged = [];
  const seen = new Set();

  for (const item of [...toArray(existing), ...toArray(fromContent)]) {
    const normalized = normalizeAttachment(item);
    if (!normalized) continue;

    const key = normalized.href || normalized.id;
    if (!key || seen.has(key)) continue;

    seen.add(key);
    merged.push(normalized);
  }

  if (merged.length === 0) return existing;
  return merged.length === 1 ? merged[0] : merged;
};

const toText = value => {
  if (typeof value !== 'string') return '';
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
};

const normalizeUrlForPreview = url => {
  const links = toArray(url).map(normalizeLinkValue).filter(Boolean);
  if (links.length === 0) return null;

  const preferred = links.find(link => {
    if (typeof link === 'string') return HTTPS_RE.test(link);
    return HTTPS_RE.test(link.href) && (link.mediaType === 'text/html' || !link.mediaType);
  });

  if (!preferred) return null;
  return typeof preferred === 'string' ? preferred : preferred.href;
};

const buildArticlePreview = article => {
  if (article.preview) {
    return article.preview;
  }

  const url = normalizeUrlForPreview(article.url || article.id);
  const nameText = toText(article.name);
  const summaryText = toText(article.summary);

  if (!nameText && !summaryText && !url) {
    return undefined;
  }

  const parts = [];
  if (nameText) parts.push(`<p><strong>${nameText}</strong></p>`);
  if (summaryText) parts.push(`<p>${summaryText}</p>`);
  if (url) parts.push(`<p><a href='${url}' rel='noopener noreferrer'>Read more</a></p>`);

  const preview = {
    type: NOTE_TYPE,
    content: parts.join(''),
  };

  if (article.attributedTo) preview.attributedTo = article.attributedTo;
  if (article.published) preview.published = article.published;
  if (article.updated) preview.updated = article.updated;
  if (article.tag) preview.tag = article.tag;
  if (article.image) {
    preview.attachment = article.image;
  }

  return preview;
};

const isArticleType = object => {
  const type = object?.type || object?.['@type'];
  if (type === ARTICLE_TYPE) return true;
  if (Array.isArray(type)) return type.includes(ARTICLE_TYPE);
  return false;
};

const normalizeArticleObject = object => {
  if (!object || typeof object !== 'object' || !isArticleType(object)) {
    return object;
  }

  const next = { ...object };
  const { kind, value } = detectContentFormat(next);

  if (typeof next.name === 'string') {
    const normalizedName = normalizeName(next.name);
    if (normalizedName) next.name = normalizedName;
  }

  if (typeof next.summary === 'string') {
    next.summary = sanitizeSummary(next.summary);
  }

  if (typeof value === 'string') {
    next.content = sanitizeLongFormContent(renderRichTextToHtml(next, value, kind));
  }

  if (next.url || next.id) {
    next.url = normalizeArticleUrl(next.url, safeType(next.id));
  }

  if (typeof next.content === 'string') {
    const extractedMedia = extractMediaAttachmentLinks(next.content);
    if (extractedMedia.length > 0) {
      next.attachment = mergeAttachments(next.attachment, extractedMedia);
    }
  }

  next.preview = buildArticlePreview(next);

  return next;
};

const normalizeLongFormActivity = activity => {
  if (!activity || typeof activity !== 'object') return activity;

  const type = activity.type || activity['@type'];
  if (type === 'Create' || type === 'Update') {
    if (!activity.object || typeof activity.object !== 'object') return activity;
    return {
      ...activity,
      object: normalizeArticleObject(activity.object),
    };
  }

  return normalizeArticleObject(activity);
};

module.exports = {
  ARTICLE_TYPE,
  NOTE_TYPE,
  FEP_B2B8_ALLOWED_TAGS,
  FEP_B2B8_ALLOWED_ATTRIBUTES,
  normalizeArticleObject,
  normalizeLongFormActivity,
  sanitizeLongFormContent,
  normalizeArticleUrl,
  buildArticlePreview,
  extractMediaAttachmentLinks,
};
