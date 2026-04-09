/**
 * FEP-268d Search Consent Middleware
 *
 * Two responsibilities:
 *
 * 1. OUTGOING (activitypub.outbox.post)
 *    Injects `searchableBy` into locally created Note objects and their
 *    wrapping Create activities before they leave the pod.  The value is
 *    derived from the object's audience fields (to/cc) unless the author
 *    has already set an explicit searchableBy value.
 *
 * 2. INCOMING (activitypub.inbox.post)
 *    Reads `searchableBy` (and falls back to toot:indexable) on Note objects
 *    received from remote servers.  Stores the resolved consent signal on
 *    ctx.meta so downstream services (SPARQL storage, indexers) can act on it
 *    without re-parsing the object.
 *
 * Middleware is applied only to outbox.post and inbox.post — all other
 * actions pass through untouched.
 */
'use strict';

const {
  injectSearchableBy,
  deriveDefaultSearchableBy,
  getSearchableBy,
  isSearchableBy,
  AS_PUBLIC
} = require('../utils/search-consent');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the inner object from a Create/Update, or the activity itself. */
const extractObject = activity => {
  if (!activity || typeof activity !== 'object') return null;
  const type = activity.type || activity['@type'];
  if (type === 'Create' || type === 'Update') {
    const obj = activity.object;
    return obj && typeof obj === 'object' ? obj : null;
  }
  if (type === 'Note' || type === 'Article' || type === 'Page') {
    return activity;
  }
  return null;
};

/**
 * Return a copy of `activity` where the inner object (Create.object or bare
 * Note) has `searchableBy` set.  If it is already present, the value is left
 * as-is.  Otherwise it is derived from the object's audience fields.
 */
const enrichWithSearchableBy = activity => {
  if (!activity || typeof activity !== 'object') return activity;

  const type = activity.type || activity['@type'];

  if (type === 'Create' || type === 'Update') {
    const obj = activity.object;
    if (!obj || typeof obj !== 'object') return activity;

    // Respect explicit author preference
    const existing = getSearchableBy(obj);
    if (existing.length > 0) return activity;

    const derived = deriveDefaultSearchableBy(obj);
    if (!derived) return activity;

    const enrichedObj = injectSearchableBy(obj, derived);
    return { ...activity, object: enrichedObj };
  }

  if (type === 'Note' || type === 'Article' || type === 'Page') {
    const existing = getSearchableBy(activity);
    if (existing.length > 0) return activity;

    const derived = deriveDefaultSearchableBy(activity);
    if (!derived) return activity;

    return injectSearchableBy(activity, derived);
  }

  return activity;
};

/**
 * Read searchConsent from an incoming object and attach to ctx.meta.
 * Downstream services read ctx.meta.searchConsent:
 *   { raw: string[], isPublic: boolean, explicitlySet: boolean }
 */
const attachSearchConsentMeta = (ctx, activity) => {
  const obj = extractObject(activity);
  if (!obj) return;

  const searchableBy = getSearchableBy(obj);
  ctx.meta.searchConsent = {
    raw: searchableBy,
    isPublic: isSearchableBy(obj, AS_PUBLIC),
    explicitlySet: searchableBy.length > 0
  };
};

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

const SearchConsentMiddleware = () => ({
  name: 'SearchConsentMiddleware',

  localAction: (next, action) => {
    // -----------------------------------------------------------------------
    // OUTGOING: inject searchableBy before posting to outbox
    // -----------------------------------------------------------------------
    if (action.name === 'activitypub.outbox.post') {
      return async ctx => {
        const { collectionUri, ...activity } = ctx.params;
        const enriched = enrichWithSearchableBy(activity);
        ctx.params = { collectionUri, ...enriched };
        return next(ctx);
      };
    }

    // -----------------------------------------------------------------------
    // INCOMING: read searchableBy and attach consent signal to ctx.meta
    // -----------------------------------------------------------------------
    if (action.name === 'activitypub.inbox.post') {
      return async ctx => {
        const { collectionUri, ...activity } = ctx.params;
        attachSearchConsentMeta(ctx, activity);
        return next(ctx);
      };
    }

    return next;
  }
});

module.exports = SearchConsentMiddleware;
