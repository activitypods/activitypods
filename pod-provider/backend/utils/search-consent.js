/**
 * FEP-268d: Search consent signals for objects
 * https://w3id.org/fep/268d
 *
 * Implements the searchableBy property as defined in FEP-268d (Fedibird/kmyblue
 * origin) and its interaction with FEP-5feb (toot:indexable, Mastodon).
 *
 * Public API:
 *   getSearchableBy(object)           → string[]  (resolved URIs, empty = not set)
 *   isSearchableBy(object, actorUri, actorData?)   → boolean
 *   injectSearchableBy(object, searchableBy)       → object (immutable)
 *   normalizeSearchableByForOutput(searchableBy)   → string | string[] | undefined
 *
 * Namespaces
 *   http://fedibird.com/ns#searchableBy   (FEP-268d)
 *   https://w3id.org/fep/268d            (canonical @context URI)
 *   http://joinmastodon.org/ns#indexable  (FEP-5feb, fallback)
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AS_PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
const AS_PUBLIC_ALIASES = new Set([AS_PUBLIC, 'as:Public', 'Public']);

/** Canonical @context URI for FEP-268d. */
const FEP_268D_CONTEXT = 'https://w3id.org/fep/268d';

/** Fedibird property IRI — used as property key by Mastodon-compatible implementations. */
const FEDIBIRD_NS = 'http://fedibird.com/ns#';
const SEARCHABLE_BY_IRI = `${FEDIBIRD_NS}searchableBy`;

/** joinmastodon indexable IRI (FEP-5feb). */
const TOOT_INDEXABLE_IRI = 'http://joinmastodon.org/ns#indexable';
const TOOT_INDEXABLE_SHORT = 'toot:indexable';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toArray = v => (Array.isArray(v) ? v : v != null ? [v] : []);

/**
 * Expand compact IRIs used in practice (as:Public, toot:indexable …).
 * We only expand what we need; a real JSON-LD expander would cover all cases,
 * but adding a heavyweight dependency here is not justified.
 */
const expandIri = iri => {
  if (!iri || typeof iri !== 'string') return null;
  if (AS_PUBLIC_ALIASES.has(iri)) return AS_PUBLIC;
  return iri;
};

/**
 * Normalise raw searchableBy value(s) from an AP object into an array of
 * expanded URI strings.  Returns an empty array when not set or when the
 * value is semantically null (JSON-LD empty array → undefined per spec note).
 */
const resolveSearchableBy = rawValue => {
  // JSON-LD semantics: [] ≡ undefined (per FEP-268d security note)
  if (!rawValue || (Array.isArray(rawValue) && rawValue.length === 0)) {
    return [];
  }

  const items = toArray(rawValue);
  const result = [];

  for (const item of items) {
    if (typeof item === 'string') {
      const expanded = expandIri(item);
      if (expanded) result.push(expanded);
    } else if (item && typeof item === 'object') {
      // Accepts { id: '...' } or { type: 'Object', id: '...' }
      const id = item.id || item['@id'];
      if (id) {
        const expanded = expandIri(id);
        if (expanded) result.push(expanded);
      }
    }
  }

  return result;
};

/**
 * Extract the searchableBy value from an AP object, checking both the short
 * property name (searchableBy) and the full IRI form.
 */
const extractSearchableByRaw = object => {
  if (!object || typeof object !== 'object') return undefined;
  // Prefer short name (used by almost all implementations)
  if ('searchableBy' in object) return object.searchableBy;
  // Full IRI form (JSON-LD expanded documents)
  if (SEARCHABLE_BY_IRI in object) return object[SEARCHABLE_BY_IRI];
  return undefined;
};

/**
 * Determine if an actor URI is covered by a set of searchableBy URIs.
 *
 * Handles:
 *   - as:Public  → matches any actor
 *   - followers collection URI  → matches if actorUri is in the collection
 *     (this implementation checks the URI pattern; full collection resolution
 *      would require an async call which is out of scope for a sync utility)
 */
const isActorIncludedIn = (searchableByUris, actorUri, actorFollowersUri) => {
  for (const uri of searchableByUris) {
    if (AS_PUBLIC_ALIASES.has(uri) || uri === AS_PUBLIC) {
      return true;
    }
    if (uri === actorUri) {
      return true;
    }
    // Followers collection: accept if provided (caller must resolve membership)
    if (actorFollowersUri && uri === actorFollowersUri) {
      return true;
    }
  }
  return false;
};

// ---------------------------------------------------------------------------
// FEP-5feb (toot:indexable) fallback
// ---------------------------------------------------------------------------

/**
 * Determine searchability via toot:indexable as per FEP-5feb.
 * Returns true|false|null (null = not set).
 */
const getIndexableValue = actor => {
  if (!actor || typeof actor !== 'object') return null;
  const raw =
    actor['indexable'] ??
    actor[TOOT_INDEXABLE_IRI] ??
    actor[TOOT_INDEXABLE_SHORT] ??
    null;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the resolved searchableBy URIs for an object.
 * Returns [] when the property is absent or semantically null.
 *
 * @param {object} object  — AP Note/object (or Actor for default inheritance)
 */
const getSearchableBy = object => {
  const raw = extractSearchableByRaw(object);
  return resolveSearchableBy(raw);
};

/**
 * Determine whether `object` may be searched by `searchingActorUri`.
 *
 * @param {object} object             — AP Note/object
 * @param {string} searchingActorUri  — WebID / AT DID of the querying actor
 * @param {object} [opts]
 * @param {string}   [opts.searchingActorFollowersUri]  — followers collection of the searching actor
 * @param {object}   [opts.attributedToActor]           — resolved AP Actor for attributedTo (for inheritance)
 * @returns {boolean}
 */
const isSearchableBy = (object, searchingActorUri, opts = {}) => {
  const { searchingActorFollowersUri = null, attributedToActor = null } = opts;

  const objectSearchableBy = getSearchableBy(object);

  // --- Object has explicit searchableBy values ----------------------------
  if (objectSearchableBy.length > 0) {
    // If searching actor is the attributed author, always allow (SHOULD)
    const attributedTo = object.attributedTo;
    if (attributedTo) {
      const attributedToId =
        typeof attributedTo === 'string' ? attributedTo : attributedTo.id || attributedTo['@id'];
      if (attributedToId && attributedToId === searchingActorUri) {
        return true;
      }
    }

    return isActorIncludedIn(objectSearchableBy, searchingActorUri, searchingActorFollowersUri);
  }

  // --- Object has no searchableBy: check attributed actor -----------------
  if (attributedToActor) {
    const actorSearchableBy = getSearchableBy(attributedToActor);

    if (actorSearchableBy.length > 0) {
      // Actor-level inheritance: object inherits actor's searchableBy (SHALL)
      return isActorIncludedIn(actorSearchableBy, searchingActorUri, searchingActorFollowersUri);
    }

    // FEP-5feb fallback: toot:indexable on attributed actor
    const indexable = getIndexableValue(attributedToActor);
    if (indexable !== null) {
      // indexable:true → as:Public; indexable:false → no one
      return indexable
        ? true
        : searchingActorUri === (
            typeof attributedToActor === 'string'
              ? attributedToActor
              : attributedToActor.id || attributedToActor['@id']
          );
    }
  }

  // --- No signals: implementation-defined (default: allow public content) -
  // For ActivityPods we follow the open-web default: objects addressed to
  // as:Public are searchable by anyone.
  const isPublicObject =
    toArray(object.to).some(r => AS_PUBLIC_ALIASES.has(r)) ||
    toArray(object.cc).some(r => AS_PUBLIC_ALIASES.has(r));

  return isPublicObject;
};

/**
 * Inject `searchableBy` into an AP object.
 * Also ensures the FEP-268d @context URI is present.
 *
 * @param {object} object        — AP Note/Create.object or Actor
 * @param {string|string[]} searchableBy  — URI(s) to set
 * @returns {object}  new object (original is not mutated)
 */
const injectSearchableBy = (object, searchableBy) => {
  if (!object || typeof object !== 'object') return object;

  const normalized =
    Array.isArray(searchableBy)
      ? searchableBy.length === 1
        ? searchableBy[0]
        : searchableBy.length === 0
        ? undefined
        : searchableBy
      : searchableBy;

  if (normalized === undefined) return object;

  // Ensure FEP-268d context
  let context = object['@context'];
  if (!context) {
    context = [FEP_268D_CONTEXT, 'https://www.w3.org/ns/activitystreams'];
  } else if (typeof context === 'string') {
    if (context !== FEP_268D_CONTEXT) {
      context = [FEP_268D_CONTEXT, context];
    }
  } else if (Array.isArray(context) && !context.includes(FEP_268D_CONTEXT)) {
    context = [FEP_268D_CONTEXT, ...context];
  }

  return { ...object, '@context': context, searchableBy: normalized };
};

/**
 * Normalise searchableBy for outgoing AP objects.
 *
 * Rules:
 *   - Single URI  → string
 *   - Multiple    → string[]
 *   - Empty/null  → undefined (omit the property)
 *
 * @param {string|string[]|null|undefined} value
 * @returns {string|string[]|undefined}
 */
const normalizeSearchableByForOutput = value => {
  if (!value) return undefined;
  const arr = toArray(value).filter(Boolean);
  if (arr.length === 0) return undefined;
  return arr.length === 1 ? arr[0] : arr;
};

// ---------------------------------------------------------------------------
// Convenience: determine default searchableBy for a locally authored object
// based on its audience fields (as:Public → searchable by all, etc.)
// ---------------------------------------------------------------------------

/**
 * Derive the appropriate searchableBy value for a locally created object
 * based on its to/cc fields.  Used when the author has not set an explicit
 * preference and there is no actor-level searchableBy.
 *
 * @param {object} object  — AP Note / Create.object
 * @returns {string|string[]|undefined}
 */
const deriveDefaultSearchableBy = object => {
  if (!object || typeof object !== 'object') return undefined;

  const to = toArray(object.to);
  const cc = toArray(object.cc);
  const all = [...to, ...cc];

  // Public visibility → searchable by anyone
  if (all.some(r => AS_PUBLIC_ALIASES.has(r))) {
    return AS_PUBLIC;
  }

  // Followers-only or direct → searchable only by attributedTo (author)
  const attributedTo = object.attributedTo;
  if (attributedTo) {
    return typeof attributedTo === 'string'
      ? attributedTo
      : attributedTo.id || attributedTo['@id'];
  }

  return undefined;
};

module.exports = {
  // Constants
  AS_PUBLIC,
  FEP_268D_CONTEXT,
  SEARCHABLE_BY_IRI,
  TOOT_INDEXABLE_IRI,

  // Helpers (exported for testing)
  toArray,
  resolveSearchableBy,
  getIndexableValue,

  // Public API
  getSearchableBy,
  isSearchableBy,
  injectSearchableBy,
  normalizeSearchableByForOutput,
  deriveDefaultSearchableBy,
};
