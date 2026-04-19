/**
 * FEP-268d / FEP-5feb Search Consent Middleware
 *
 * Responsibilities:
 *
 * 1. OUTGOING (activitypub.outbox.post)
 *    Preserves explicit object-level searchableBy and normalizes its context,
 *    but does not synthesize new searchableBy values from audience targeting.
 *
 * 2. INCOMING (activitypub.inbox.post)
 *    Resolves object-level and actor-level search consent and stores the
 *    normalized signal on ctx.meta.searchConsent for downstream consumers.
 *
 * 3. ACTOR READS (activitypub.actor.get / activitypub.actor.getProfile)
 *    Normalizes actor-level searchableBy / indexable output and explicitly
 *    defaults missing actor consent to indexable: false for AP consumers.
 */
'use strict';

const {
  injectSearchableBy,
  getSearchableBy,
  normalizeActorSearchConsentForOutput,
  resolvePublicSearchConsent
} = require('../utils/search-consent');

const OBJECT_BEARING_TYPES = new Set(['Create', 'Update']);
const SEARCHABLE_OBJECT_TYPES = new Set(['Note', 'Article', 'Page']);

const extractObject = activity => {
  if (!activity || typeof activity !== 'object') return null;

  const type = activity.type || activity['@type'];
  if (OBJECT_BEARING_TYPES.has(type)) {
    const obj = activity.object;
    return obj && typeof obj === 'object' ? obj : null;
  }

  if (SEARCHABLE_OBJECT_TYPES.has(type)) {
    return activity;
  }

  return null;
};

const enrichExplicitSearchableBy = activity => {
  if (!activity || typeof activity !== 'object') return activity;

  const type = activity.type || activity['@type'];
  if (OBJECT_BEARING_TYPES.has(type)) {
    const obj = activity.object;
    if (!obj || typeof obj !== 'object') return activity;

    const searchableBy = getSearchableBy(obj);
    if (searchableBy.length === 0) return activity;

    const enrichedObject = injectSearchableBy(obj, searchableBy);
    return enrichedObject === obj ? activity : { ...activity, object: enrichedObject };
  }

  if (SEARCHABLE_OBJECT_TYPES.has(type)) {
    const searchableBy = getSearchableBy(activity);
    if (searchableBy.length === 0) return activity;
    return injectSearchableBy(activity, searchableBy);
  }

  return activity;
};

const attachSearchConsentMeta = async (ctx, activity) => {
  const obj = extractObject(activity);
  if (!obj) return;

  let attributedToActor = null;
  const attributedTo = obj.attributedTo;
  const attributedToUri =
    typeof attributedTo === 'string'
      ? attributedTo
      : attributedTo && typeof attributedTo === 'object'
        ? attributedTo.id || attributedTo['@id'] || null
        : null;

  if (attributedTo && typeof attributedTo === 'object' && !Array.isArray(attributedTo)) {
    attributedToActor = attributedTo;
  } else if (attributedToUri && typeof ctx.call === 'function') {
    attributedToActor = await Promise.resolve(
      ctx.call('activitypub.actor.get', {
        actorUri: attributedToUri,
        webId: 'system'
      })
    ).catch(() => null);
  }

  ctx.meta.searchConsent = resolvePublicSearchConsent(obj, { attributedToActor });
};

const SearchConsentMiddleware = () => ({
  name: 'SearchConsentMiddleware',

  localAction: (next, action) => {
    const shouldNormalizeOutgoing = action.name === 'activitypub.outbox.post';
    const shouldReadIncoming = action.name === 'activitypub.inbox.post';
    const shouldNormalizeActorResult =
      action.name === 'activitypub.actor.get' || action.name === 'activitypub.actor.getProfile';

    if (!shouldNormalizeOutgoing && !shouldReadIncoming && !shouldNormalizeActorResult) {
      return next;
    }

    return async ctx => {
      if (shouldNormalizeOutgoing && ctx.params && typeof ctx.params === 'object') {
        const { collectionUri, ...activity } = ctx.params;
        const enriched = enrichExplicitSearchableBy(activity);
        if (enriched !== activity) {
          ctx.params = collectionUri ? { collectionUri, ...enriched } : enriched;
        }
      }

      if (shouldReadIncoming && ctx.params && typeof ctx.params === 'object') {
        const { collectionUri, ...activity } = ctx.params;
        await attachSearchConsentMeta(ctx, activity);
        if (collectionUri) {
          ctx.params = { collectionUri, ...activity };
        }
      }

      const result = await next(ctx);

      if (shouldNormalizeActorResult && result && typeof result === 'object') {
        return normalizeActorSearchConsentForOutput(result);
      }

      return result;
    };
  }
});

module.exports = SearchConsentMiddleware;
