'use strict';

/**
 * MediaAttachmentsMiddleware
 *
 * Normalizes media attachment objects on ActivityPub Notes and Articles to
 * comply with FEP-1311: Media Attachments.
 *
 * Key normalisations applied:
 *   - `Document` or `Link` objects whose MIME type indicates audio/image/video
 *     are re-typed to `Audio`, `Image`, or `Video` respectively.
 *   - Old-style objects using `href` instead of `url` have the field migrated.
 *   - Bare string URLs with a recognisable media extension are promoted to
 *     typed objects.
 *   - Optional FEP-1311 fields (width, height, duration, size, digestMultibase,
 *     focalPoint, blurHash) are preserved when present.
 *   - Non-media attachments (e.g. OG-preview `Link`s added by
 *     LinkPreviewMiddleware, FEP-0ea0 payment links) are passed through
 *     unchanged.
 *   - Multi-version url arrays (FEP-1311 §Multiple Media Versions) are left
 *     intact.
 *
 * Runs on both activitypub.outbox.post and activitypub.inbox.post so that
 * both outgoing and incoming objects are normalised consistently.
 */

const { hasType } = require('@semapps/ldp');
const { normalizeObjectMediaAttachments } = require('../utils/media-attachments');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OBJECT_BEARING_TYPES = new Set(['Create', 'Update']);

/**
 * Return true when the activity carries a Note or Article object whose
 * attachments we should normalise.
 *
 * @param {object} activity
 * @returns {boolean}
 */
const shouldNormalize = activity => {
  if (!activity || typeof activity !== 'object') return false;

  if (OBJECT_BEARING_TYPES.has(activity.type) || OBJECT_BEARING_TYPES.has(activity['@type'])) {
    return !!(activity.object && typeof activity.object === 'object');
  }

  // Bare object (Article / Note) passed directly — also normalize
  return !!((hasType(activity, 'Note') || hasType(activity, 'Article')) && activity.attachment != null);
};

/**
 * Normalise the embedded object (or bare object) inside an activity.
 *
 * @param {object} activity
 * @returns {object}
 */
const normalizeActivityAttachments = activity => {
  if (!shouldNormalize(activity)) return activity;

  const isWrapped = OBJECT_BEARING_TYPES.has(activity.type) || OBJECT_BEARING_TYPES.has(activity['@type']);

  if (isWrapped) {
    const normalizedObject = normalizeObjectMediaAttachments(activity.object);
    if (normalizedObject === activity.object) return activity; // nothing changed
    return { ...activity, object: normalizedObject };
  }

  return normalizeObjectMediaAttachments(activity);
};

// ---------------------------------------------------------------------------
// Moleculer middleware
// ---------------------------------------------------------------------------

const MediaAttachmentsMiddleware = () => ({
  name: 'MediaAttachmentsMiddleware',
  localAction: (next, action) => {
    if (action.name !== 'activitypub.outbox.post' && action.name !== 'activitypub.inbox.post') {
      return next;
    }

    return async ctx => {
      if (!ctx.params || typeof ctx.params !== 'object') {
        return next(ctx);
      }

      const { collectionUri, ...activity } = ctx.params;
      const normalized = normalizeActivityAttachments(activity);

      if (normalized !== activity) {
        ctx.params = collectionUri ? { collectionUri, ...normalized } : normalized;
      }

      return next(ctx);
    };
  }
});

module.exports = MediaAttachmentsMiddleware;
