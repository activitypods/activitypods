/**
 * FEP-268d: Search consent signals for objects
 * https://w3id.org/fep/268d
 *
 * Implements the searchableBy property as defined in FEP-268d and its
 * interaction with FEP-5feb (toot:indexable).
 *
 * Public API:
 *   getSearchableBy(object) → string[]
 *   getIndexableValue(actor) → boolean | null
 *   isSearchableBy(object, actorUri, opts?) → boolean
 *   injectSearchableBy(object, searchableBy) → object
 *   normalizeSearchableByForOutput(searchableBy) → string | string[] | undefined
 *   resolvePublicSearchConsent(object, opts?) → consent descriptor
 *   normalizeActorSearchConsentForOutput(actor) → actor with normalized fields
 */

'use strict';

const AS_PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
const AS_PUBLIC_ALIASES = new Set([AS_PUBLIC, 'as:Public', 'Public']);
const FEP_268D_CONTEXT = 'https://w3id.org/fep/268d';
const FEDIBIRD_NS = 'http://fedibird.com/ns#';
const SEARCHABLE_BY_IRI = `${FEDIBIRD_NS}searchableBy`;
const TOOT_INDEXABLE_IRI = 'http://joinmastodon.org/ns#indexable';
const TOOT_INDEXABLE_SHORT = 'toot:indexable';
const TOOT_CONTEXT = {
  toot: 'http://joinmastodon.org/ns#',
  indexable: TOOT_INDEXABLE_SHORT
};

const toArray = value => (Array.isArray(value) ? value : value != null ? [value] : []);

const asRecord = value =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : null;

const expandIri = iri => {
  if (!iri || typeof iri !== 'string') return null;
  const trimmed = iri.trim();
  if (!trimmed) return null;
  if (AS_PUBLIC_ALIASES.has(trimmed)) return AS_PUBLIC;
  return trimmed;
};

const unique = values => [...new Set(values)];

const resolveSearchableBy = rawValue => {
  if (rawValue == null || (Array.isArray(rawValue) && rawValue.length === 0)) {
    return [];
  }

  return unique(
    toArray(rawValue)
      .map(item => {
        if (typeof item === 'string') {
          return expandIri(item);
        }

        const record = asRecord(item);
        if (!record) return null;
        return expandIri(record.id || record['@id'] || record.href);
      })
      .filter(Boolean)
  );
};

const extractSearchableByRaw = object => {
  const record = asRecord(object);
  if (!record) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, 'searchableBy')) return record.searchableBy;
  if (Object.prototype.hasOwnProperty.call(record, SEARCHABLE_BY_IRI)) return record[SEARCHABLE_BY_IRI];
  return undefined;
};

const getSearchableBy = object => resolveSearchableBy(extractSearchableByRaw(object));

const getIndexableValue = actor => {
  const record = asRecord(actor);
  if (!record) return null;

  const raw =
    record.indexable ??
    record[TOOT_INDEXABLE_IRI] ??
    record[TOOT_INDEXABLE_SHORT] ??
    null;

  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
};

const isActorIncludedIn = (searchableByUris, actorUri, actorFollowersUri) => {
  for (const uri of searchableByUris) {
    if (uri === AS_PUBLIC) return true;
    if (uri === actorUri) return true;
    if (actorFollowersUri && uri === actorFollowersUri) return true;
  }
  return false;
};

const isPublicAddressed = object => {
  const record = asRecord(object);
  if (!record) return false;

  return ['to', 'cc'].some(field =>
    toArray(record[field]).some(entry => {
      if (typeof entry === 'string') {
        return expandIri(entry) === AS_PUBLIC;
      }

      const node = asRecord(entry);
      return expandIri(node?.id || node?.['@id'] || node?.href) === AS_PUBLIC;
    })
  );
};

const includesPublic = searchableBy => searchableBy.includes(AS_PUBLIC);

const resolvePublicSearchConsent = (object, opts = {}) => {
  const objectSearchableBy = getSearchableBy(object);
  if (objectSearchableBy.length > 0) {
    return {
      raw: objectSearchableBy,
      isPublic: includesPublic(objectSearchableBy),
      explicitlySet: true,
      source: 'object_searchableBy',
      objectSearchableBy,
      actorSearchableBy: [],
      actorIndexable: null,
      actorIndexableExplicit: false
    };
  }

  const actorSearchableBy = getSearchableBy(opts.attributedToActor);
  if (actorSearchableBy.length > 0) {
    return {
      raw: actorSearchableBy,
      isPublic: includesPublic(actorSearchableBy),
      explicitlySet: true,
      source: 'actor_searchableBy',
      objectSearchableBy: [],
      actorSearchableBy,
      actorIndexable: null,
      actorIndexableExplicit: false
    };
  }

  const actorIndexable = getIndexableValue(opts.attributedToActor);
  if (actorIndexable !== null) {
    return {
      raw: [],
      isPublic: actorIndexable === true,
      explicitlySet: true,
      source: 'actor_indexable',
      objectSearchableBy: [],
      actorSearchableBy: [],
      actorIndexable,
      actorIndexableExplicit: true
    };
  }

  return {
    raw: [],
    isPublic: false,
    explicitlySet: false,
    source: 'none',
    objectSearchableBy: [],
    actorSearchableBy: [],
    actorIndexable: null,
    actorIndexableExplicit: false
  };
};

const isSearchableBy = (object, searchingActorUri, opts = {}) => {
  const { searchingActorFollowersUri = null, attributedToActor = null } = opts;

  const objectSearchableBy = getSearchableBy(object);
  if (objectSearchableBy.length > 0) {
    const attributedTo = object?.attributedTo;
    if (attributedTo) {
      const attributedToId =
        typeof attributedTo === 'string' ? attributedTo : attributedTo.id || attributedTo['@id'];
      if (attributedToId && attributedToId === searchingActorUri) {
        return true;
      }
    }

    return isActorIncludedIn(objectSearchableBy, searchingActorUri, searchingActorFollowersUri);
  }

  if (attributedToActor) {
    const actorSearchableBy = getSearchableBy(attributedToActor);
    if (actorSearchableBy.length > 0) {
      const actorId =
        typeof attributedToActor === 'string'
          ? attributedToActor
          : attributedToActor.id || attributedToActor['@id'] || null;
      if (actorId && actorId === searchingActorUri) {
        return true;
      }
      return isActorIncludedIn(actorSearchableBy, searchingActorUri, searchingActorFollowersUri);
    }

    const indexable = getIndexableValue(attributedToActor);
    if (indexable !== null) {
      if (indexable) return true;

      const actorId =
        typeof attributedToActor === 'string'
          ? attributedToActor
          : attributedToActor.id || attributedToActor['@id'] || null;
      return actorId != null && actorId === searchingActorUri;
    }
  }

  return isPublicAddressed(object);
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

const contextIncludesFep268d = value => {
  if (Array.isArray(value)) {
    return value.some(entry => contextIncludesFep268d(entry));
  }

  if (value === FEP_268D_CONTEXT) {
    return true;
  }

  const record = asRecord(value);
  if (!record) return false;
  return record.searchableBy === SEARCHABLE_BY_IRI;
};

const contextIncludesTootIndexable = value => {
  if (Array.isArray(value)) {
    return value.some(entry => contextIncludesTootIndexable(entry));
  }

  const record = asRecord(value);
  if (!record) return false;
  return (
    record.toot === TOOT_CONTEXT.toot ||
    record.indexable === TOOT_CONTEXT.indexable ||
    record.indexable === TOOT_INDEXABLE_IRI
  );
};

const injectSearchableBy = (object, searchableBy) => {
  const record = asRecord(object);
  if (!record) return object;

  const normalized = normalizeSearchableByForOutput(searchableBy);
  if (normalized === undefined) return object;

  let enriched = { ...record, searchableBy: normalized };
  if (!contextIncludesFep268d(enriched['@context'])) {
    enriched = withContextEntry(enriched, FEP_268D_CONTEXT);
  }
  return enriched;
};

const normalizeSearchableByForOutput = value => {
  const normalized = resolveSearchableBy(value);
  if (normalized.length === 0) return undefined;
  return normalized.length === 1 ? normalized[0] : normalized;
};

const normalizeActorSearchConsentForOutput = actor => {
  const record = asRecord(actor);
  if (!record) return actor;

  const searchableBy = getSearchableBy(record);
  const indexable = getIndexableValue(record);
  const nextRecord = { ...record };

  delete nextRecord[SEARCHABLE_BY_IRI];
  delete nextRecord[TOOT_INDEXABLE_IRI];
  delete nextRecord[TOOT_INDEXABLE_SHORT];

  if (searchableBy.length > 0) {
    nextRecord.searchableBy = normalizeSearchableByForOutput(searchableBy);
  } else {
    delete nextRecord.searchableBy;
  }

  if (indexable !== null) {
    nextRecord.indexable = indexable;
  } else if (searchableBy.length === 0) {
    nextRecord.indexable = false;
  } else {
    delete nextRecord.indexable;
  }

  let enriched = nextRecord;
  if (searchableBy.length > 0 && !contextIncludesFep268d(enriched['@context'])) {
    enriched = withContextEntry(enriched, FEP_268D_CONTEXT);
  }
  if (typeof enriched.indexable === 'boolean' && !contextIncludesTootIndexable(enriched['@context'])) {
    enriched = withContextEntry(enriched, TOOT_CONTEXT);
  }

  return enriched;
};

const deriveDefaultSearchableBy = object => {
  if (!asRecord(object)) return undefined;
  if (isPublicAddressed(object)) return AS_PUBLIC;

  const attributedTo = object.attributedTo;
  if (!attributedTo) return undefined;

  if (typeof attributedTo === 'string') return attributedTo;
  return attributedTo.id || attributedTo['@id'] || undefined;
};

module.exports = {
  AS_PUBLIC,
  FEP_268D_CONTEXT,
  SEARCHABLE_BY_IRI,
  TOOT_INDEXABLE_IRI,
  TOOT_INDEXABLE_SHORT,
  TOOT_CONTEXT,
  toArray,
  resolveSearchableBy,
  getSearchableBy,
  getIndexableValue,
  isPublicAddressed,
  resolvePublicSearchConsent,
  isSearchableBy,
  injectSearchableBy,
  normalizeSearchableByForOutput,
  normalizeActorSearchConsentForOutput,
  deriveDefaultSearchableBy
};
