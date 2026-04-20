'use strict';

const TOOT_NS = 'http://joinmastodon.org/ns#';
const TOOT_ATTRIBUTION_DOMAINS_IRI = `${TOOT_NS}attributionDomains`;
const TOOT_ATTRIBUTION_DOMAINS_SHORT = 'toot:attributionDomains';
const TOOT_AUTHOR_ATTRIBUTION_CONTEXT = {
  toot: TOOT_NS,
  attributionDomains: TOOT_ATTRIBUTION_DOMAINS_SHORT
};

const ACTOR_TYPES = new Set(['Application', 'Group', 'Organization', 'Person', 'Service']);

const toArray = value => (Array.isArray(value) ? value : value != null ? [value] : []);

const asRecord = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

const hasActorType = object => {
  const record = asRecord(object);
  if (!record) return false;
  const rawTypes = toArray(record.type || record['@type']);
  return rawTypes.some(type => ACTOR_TYPES.has(type));
};

const normalizeDomain = value => {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.username || parsed.password || !parsed.hostname) return null;
    return parsed.hostname.toLowerCase().replace(/\.+$/, '') || null;
  } catch {
    return null;
  }
};

const getAttributionDomains = actor => {
  const record = asRecord(actor);
  if (!record) return [];

  const raw =
    record.attributionDomains ?? record[TOOT_ATTRIBUTION_DOMAINS_IRI] ?? record[TOOT_ATTRIBUTION_DOMAINS_SHORT];

  return [...new Set(toArray(raw).map(normalizeDomain).filter(Boolean))];
};

const isAuthorizedAttributionDomain = (hostname, attributionDomains) => {
  const normalizedHost = normalizeDomain(hostname);
  if (!normalizedHost) return false;

  return attributionDomains.some(domain => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`));
};

const contextIncludesAuthorAttributionTerms = value => {
  if (Array.isArray(value)) {
    return value.some(entry => contextIncludesAuthorAttributionTerms(entry));
  }

  const record = asRecord(value);
  if (!record) return false;

  return (
    record.attributionDomains === TOOT_ATTRIBUTION_DOMAINS_SHORT ||
    record.attributionDomains === TOOT_ATTRIBUTION_DOMAINS_IRI
  );
};

const withContextEntry = (record, entry) => {
  const existingContext = record['@context'];
  if (Array.isArray(existingContext)) {
    return { ...record, '@context': [...existingContext, entry] };
  }
  if (existingContext != null) {
    return { ...record, '@context': [existingContext, entry] };
  }
  return {
    ...record,
    '@context': ['https://www.w3.org/ns/activitystreams', entry]
  };
};

const normalizeActorAuthorAttributionForOutput = actorObject => {
  if (!hasActorType(actorObject)) return actorObject;

  const domains = getAttributionDomains(actorObject);
  const nextActor = { ...actorObject };

  delete nextActor[TOOT_ATTRIBUTION_DOMAINS_IRI];
  delete nextActor[TOOT_ATTRIBUTION_DOMAINS_SHORT];

  if (domains.length > 0) {
    nextActor.attributionDomains = domains;
  } else {
    delete nextActor.attributionDomains;
  }

  const enriched =
    domains.length > 0 && !contextIncludesAuthorAttributionTerms(nextActor['@context'])
      ? withContextEntry(nextActor, TOOT_AUTHOR_ATTRIBUTION_CONTEXT)
      : nextActor;

  const hadAlternativeKeys =
    Object.prototype.hasOwnProperty.call(actorObject, TOOT_ATTRIBUTION_DOMAINS_IRI) ||
    Object.prototype.hasOwnProperty.call(actorObject, TOOT_ATTRIBUTION_DOMAINS_SHORT);
  const hadCanonicalKey = Object.prototype.hasOwnProperty.call(actorObject, 'attributionDomains');
  const currentDomains = Array.isArray(actorObject.attributionDomains)
    ? actorObject.attributionDomains
    : actorObject.attributionDomains != null
      ? [actorObject.attributionDomains]
      : [];
  const unchangedDomains =
    currentDomains.length === domains.length && currentDomains.every((value, index) => value === domains[index]);

  if (!hadAlternativeKeys && !hadCanonicalKey && unchangedDomains && enriched['@context'] === actorObject['@context']) {
    return actorObject;
  }

  return enriched;
};

module.exports = {
  TOOT_NS,
  TOOT_ATTRIBUTION_DOMAINS_IRI,
  TOOT_ATTRIBUTION_DOMAINS_SHORT,
  TOOT_AUTHOR_ATTRIBUTION_CONTEXT,
  hasActorType,
  normalizeDomain,
  getAttributionDomains,
  isAuthorizedAttributionDomain,
  normalizeActorAuthorAttributionForOutput
};
