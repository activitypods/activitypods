'use strict';

const FOLLOWABLE_ERRORS = Object.freeze({
  OBJECT_HAS_UNKNOWN_FOLLOWERS_COLLECTION: 'OBJECT_HAS_UNKNOWN_FOLLOWERS_COLLECTION',
  MAX_RECURSION_LIMIT: 'MAX_RECURSION_LIMIT',
  TARGET_NOT_RESOLVABLE: 'TARGET_NOT_RESOLVABLE',
});

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeIri = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const firstIri = value => {
  if (typeof value === 'string') return normalizeIri(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const iri = firstIri(item);
      if (iri) return iri;
    }
    return null;
  }
  if (isObject(value)) {
    return normalizeIri(value.id) || normalizeIri(value['@id']) || null;
  }
  return null;
};

const hasFollowersCollection = object => {
  if (!isObject(object)) return false;
  return Boolean(firstIri(object.followers));
};

const findInboxOnObject = object => {
  if (!isObject(object)) return null;
  return firstIri(object.inbox) || null;
};

const resolveAttributedToRef = object => {
  if (!isObject(object)) return null;
  return firstIri(object.attributedTo);
};

/**
 * Resolve follow delivery target from a potentially followable object.
 *
 * @param {object} objectToFollow
 * @param {(uri: string) => Promise<object | null>} dereferenceByUri
 * @param {{ recursionLimit?: number, requireFollowersCollection?: boolean }} options
 * @returns {Promise<{ inboxUri: string, recipientUri: string, recursionDepthUsed: number, objectId: string | null, followersUri: string | null }>}
 */
const resolveFollowDeliveryTarget = async (objectToFollow, dereferenceByUri, options = {}) => {
  const recursionLimit = Number.isInteger(options.recursionLimit) ? options.recursionLimit : 1;
  const requireFollowersCollection = options.requireFollowersCollection !== false;

  if (!isObject(objectToFollow)) {
    const error = new Error('Target object is not resolvable');
    error.code = FOLLOWABLE_ERRORS.TARGET_NOT_RESOLVABLE;
    throw error;
  }

  const objectId = firstIri(objectToFollow.id) || firstIri(objectToFollow['@id']) || null;
  const followersUri = firstIri(objectToFollow.followers) || null;

  if (requireFollowersCollection && !followersUri) {
    const error = new Error('Target object has unknown followers collection');
    error.code = FOLLOWABLE_ERRORS.OBJECT_HAS_UNKNOWN_FOLLOWERS_COLLECTION;
    throw error;
  }

  const directInbox = findInboxOnObject(objectToFollow);
  if (directInbox) {
    return {
      inboxUri: directInbox,
      recipientUri: objectId || directInbox,
      recursionDepthUsed: 0,
      objectId,
      followersUri,
    };
  }

  let depthRemaining = recursionLimit;
  let depthUsed = 0;
  let current = objectToFollow;

  while (!findInboxOnObject(current)) {
    if (depthRemaining <= 0) {
      const error = new Error('Maximum recursion limit reached while resolving follow inbox');
      error.code = FOLLOWABLE_ERRORS.MAX_RECURSION_LIMIT;
      throw error;
    }

    const attributedToUri = resolveAttributedToRef(current);
    if (!attributedToUri) {
      const error = new Error('Target object is not resolvable');
      error.code = FOLLOWABLE_ERRORS.TARGET_NOT_RESOLVABLE;
      throw error;
    }

    const resolved = await dereferenceByUri(attributedToUri);
    if (!isObject(resolved)) {
      const error = new Error('Target object is not resolvable');
      error.code = FOLLOWABLE_ERRORS.TARGET_NOT_RESOLVABLE;
      throw error;
    }

    current = resolved;
    depthRemaining -= 1;
    depthUsed += 1;
  }

  const resolvedInbox = findInboxOnObject(current);
  const recipientUri = firstIri(current.id) || firstIri(current['@id']) || resolveAttributedToRef(objectToFollow) || resolvedInbox;

  return {
    inboxUri: resolvedInbox,
    recipientUri,
    recursionDepthUsed: depthUsed,
    objectId,
    followersUri,
  };
};

module.exports = {
  FOLLOWABLE_ERRORS,
  resolveFollowDeliveryTarget,
};
