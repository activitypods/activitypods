'use strict';

const fetch = require('node-fetch');
const { isIP } = require('node:net');
const { getAttributionDomains, isAuthorizedAttributionDomain } = require('./author-attribution');

const USER_AGENT = 'ActivityPods/1.0 (+https://activitypods.org; +bot)';
const TIMEOUT_MS = 4_000;
const AUTHOR_ATTRIBUTION_TIMEOUT_MS = 3_000;
const MAX_READ_BYTES = 50_000;
const MAX_JSON_READ_BYTES = 100_000;
const MAX_PREVIEW_AUTHORS = 4;
const ALLOW_PRIVATE_PREVIEW_FETCHES_ENV = 'ALLOW_PRIVATE_PREVIEW_FETCHES';

const asRecord = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

const isPrivatePreviewAllowed = () => process.env[ALLOW_PRIVATE_PREVIEW_FETCHES_ENV] === '1';

const sanitizeHttpUrl = value => {
  if (!value || typeof value !== 'string') return null;

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

const isPrivateIpv4 = ip => {
  if (ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) {
    return true;
  }
  if (!ip.startsWith('172.')) return false;
  const second = Number.parseInt(ip.split('.')[1] || '-1', 10);
  return second >= 16 && second <= 31;
};

const isPrivateIpv6 = ip => {
  const lower = ip.toLowerCase();
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:');
};

const isDisallowedPreviewHost = hostname => {
  const normalized = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1');

  if (!normalized) return true;
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') return true;

  const ipType = isIP(normalized);
  if (ipType === 4) return isPrivateIpv4(normalized);
  if (ipType === 6) return isPrivateIpv6(normalized);
  return false;
};

const isPreviewTargetAllowed = url => {
  if (isPrivatePreviewAllowed()) return true;
  return !isDisallowedPreviewHost(url.hostname);
};

const readBodyLimited = async (stream, maxBytes) => {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    totalBytes += buffer.length;
    if (totalBytes >= maxBytes) break;
  }

  return Buffer.concat(chunks, Math.min(totalBytes, maxBytes)).toString('utf8');
};

const fetchJsonRecord = async (url, headers) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  if (!isPreviewTargetAllowed(parsedUrl)) return null;

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      timeout: AUTHOR_ATTRIBUTION_TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        ...headers
      }
    });

    if (!response.ok) return null;

    const payload = await readBodyLimited(response.body, MAX_JSON_READ_BYTES);
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const extractMetaTags = html => {
  const tags = {};

  for (const metaMatch of html.matchAll(/<meta\b([^>]*?)>/gi)) {
    const attrs = metaMatch[1] ?? '';
    const keyMatch = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const valueMatch = /content\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (!keyMatch || !valueMatch) continue;

    const key = keyMatch[1].toLowerCase();
    if (key && !tags[key]) {
      tags[key] = unescapeHtml(valueMatch[1]);
    }
  }

  return tags;
};

const extractMetaTagValues = (html, key) => {
  const values = [];
  const targetKey = String(key || '').toLowerCase();

  for (const metaMatch of html.matchAll(/<meta\b([^>]*?)>/gi)) {
    const attrs = metaMatch[1] ?? '';
    const keyMatch = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const valueMatch = /content\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (!keyMatch || !valueMatch) continue;
    if (keyMatch[1].toLowerCase() !== targetKey) continue;
    values.push(unescapeHtml(valueMatch[1]));
  }

  return [...new Set(values)];
};

const extractPageTitle = html => {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? unescapeHtml(match[1]?.trim() || '') : undefined;
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

  return sanitizeHttpUrl(
    typeof record.href === 'string' ? record.href : typeof record.url === 'string' ? record.url : null
  );
};

const resolveActorUrlFromWebFinger = payload => {
  const links = Array.isArray(payload?.links) ? payload.links : [];
  for (const link of links) {
    const record = asRecord(link);
    if (!record || record.rel !== 'self') continue;
    const type = typeof record.type === 'string' ? record.type : '';
    if (!type.includes('activity+json') && !type.includes('ld+json')) continue;
    const href = sanitizeHttpUrl(typeof record.href === 'string' ? record.href : null);
    if (href) return href;
  }
  return null;
};

const resolveProfileUrlFromWebFinger = payload => {
  const links = Array.isArray(payload?.links) ? payload.links : [];
  for (const link of links) {
    const record = asRecord(link);
    if (!record) continue;
    const rel = typeof record.rel === 'string' ? record.rel : '';
    if (rel !== 'http://webfinger.net/rel/profile-page' && rel !== 'profile-page') continue;
    const href = sanitizeHttpUrl(typeof record.href === 'string' ? record.href : null);
    if (href) return href;
  }
  return null;
};

const normalizeCreatorAuthority = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(`https://${trimmed}`);
    if (parsed.username || parsed.password || !parsed.hostname) return null;
    const domain = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    if (!domain) return null;
    return {
      domain,
      authority: parsed.port ? `${domain}:${parsed.port}` : domain
    };
  } catch {
    return null;
  }
};

const normalizeCreatorHandle = value => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^acct:/i, '').replace(/^@/, '');
  const match = /^([^@\s]+)@([^@\s]+)$/.exec(trimmed);
  if (!match) return null;

  const username = match[1].trim();
  const parsedAuthority = normalizeCreatorAuthority(match[2]);
  if (!username || !parsedAuthority) return null;

  return {
    handle: `@${username}@${parsedAuthority.authority}`,
    acct: `${username}@${parsedAuthority.authority}`,
    username,
    domain: parsedAuthority.domain,
    authority: parsedAuthority.authority
  };
};

const buildAuthorResolutionBaseUrls = authority => {
  const bases = [`https://${authority}`];
  if (isPrivatePreviewAllowed()) {
    bases.push(`http://${authority}`);
  }
  return bases;
};

const buildPreviewAuthorAccount = (actorDocument, creator) => {
  const icon = asRecord(actorDocument.icon);
  const avatarUrl = sanitizeHttpUrl(typeof icon?.url === 'string' ? icon.url : null);
  const attributionDomains = getAttributionDomains(actorDocument);

  return {
    acct: creator.acct,
    uri: sanitizeHttpUrl(typeof actorDocument.id === 'string' ? actorDocument.id : null),
    url: extractFirstHttpUrl(actorDocument.url) || sanitizeHttpUrl(typeof actorDocument.id === 'string' ? actorDocument.id : null),
    displayName:
      typeof actorDocument.name === 'string' && actorDocument.name.trim()
        ? actorDocument.name.trim().slice(0, 300)
        : creator.handle,
    avatarUrl: avatarUrl || null,
    attributionDomains
  };
};

const resolvePreviewAuthor = async (creator, pageHost) => {
  const fallbackBase = buildAuthorResolutionBaseUrls(creator.authority)[0];
  const fallbackUrl = new URL(`/@${encodeURIComponent(creator.username)}`, fallbackBase).toString();
  const fallback = {
    name: creator.handle,
    url: fallbackUrl,
    handle: creator.handle,
    verified: false,
    verificationState: 'claimed',
    verificationReason: 'actor_unresolved'
  };

  let jrd = null;
  for (const baseUrl of buildAuthorResolutionBaseUrls(creator.authority)) {
    const webfingerUrl = new URL('/.well-known/webfinger', baseUrl);
    webfingerUrl.searchParams.set('resource', `acct:${creator.acct}`);
    if (!isPreviewTargetAllowed(webfingerUrl)) continue;

    jrd = await fetchJsonRecord(webfingerUrl.toString(), {
      Accept: 'application/jrd+json, application/json;q=0.9'
    });
    if (jrd) break;
  }
  if (!jrd) return fallback;

  const actorUrl = resolveActorUrlFromWebFinger(jrd);
  const profileUrl = resolveProfileUrlFromWebFinger(jrd) || fallbackUrl;
  if (!actorUrl) {
    return { ...fallback, url: profileUrl, verificationReason: 'actor_url_unresolved' };
  }

  const actorDocument = await fetchJsonRecord(actorUrl, {
    Accept: 'application/activity+json, application/ld+json;q=0.9, application/json;q=0.5'
  });
  if (!actorDocument) {
    return { ...fallback, url: profileUrl, verificationReason: 'actor_document_unresolved' };
  }

  const account = buildPreviewAuthorAccount(actorDocument, creator);
  const authorUrl = account.url || profileUrl;
  const authorName = account.displayName || creator.handle;
  const verified = isAuthorizedAttributionDomain(pageHost, account.attributionDomains || []);

  return {
    name: authorName,
    url: authorUrl,
    handle: creator.handle,
    account,
    verified,
    verificationState: verified ? 'verified' : 'claimed',
    verificationReason: verified ? 'domain_authorized' : 'domain_not_authorized'
  };
};

const resolvePreviewAuthors = async (pageUrl, html) => {
  const pageHost = pageUrl.hostname.toLowerCase().replace(/\.+$/, '');
  const handles = extractMetaTagValues(html, 'fediverse:creator')
    .map(normalizeCreatorHandle)
    .filter(Boolean)
    .slice(0, MAX_PREVIEW_AUTHORS);

  if (handles.length === 0) return [];

  const authors = await Promise.all(handles.map(handle => resolvePreviewAuthor(handle, pageHost)));
  return authors.filter(Boolean);
};

const parseOpenGraph = async (originalUrl, html) => {
  const og = extractMetaTags(html);
  const title = og['og:title'] ?? og['twitter:title'] ?? extractPageTitle(html);
  if (!title) return null;

  const fallbackUri = sanitizeHttpUrl(originalUrl.toString());
  if (!fallbackUri) return null;

  const authors = await resolvePreviewAuthors(originalUrl, html);
  const primaryAuthor = authors[0];

  return {
    uri: sanitizeHttpUrl(og['og:url']) || fallbackUri,
    title: title.trim().slice(0, 300),
    description:
      (og['og:description'] ?? og['twitter:description'] ?? og.description)?.trim().slice(0, 1000) || undefined,
    thumbUrl: sanitizeHttpUrl(og['og:image'] ?? og['twitter:image']) || undefined,
    authorName: primaryAuthor?.name,
    authorUrl: primaryAuthor?.url,
    authors: authors.length > 0 ? authors : undefined
  };
};

const fetchOpenGraph = async url => {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null;
  if (parsedUrl.username || parsedUrl.password) return null;
  if (!isPreviewTargetAllowed(parsedUrl)) return null;

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'
      }
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return null;
    }

    const html = await readBodyLimited(response.body, MAX_READ_BYTES);
    return parseOpenGraph(parsedUrl, html);
  } catch {
    return null;
  }
};

const unescapeHtml = value =>
  String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

module.exports = { fetchOpenGraph };
