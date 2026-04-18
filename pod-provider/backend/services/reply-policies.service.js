'use strict';

const { MIME_TYPES } = require('@semapps/mime-types');
const CONFIG = require('../config/config');

const REPLIES_PREDICATE = 'https://www.w3.org/ns/activitystreams#replies';
const PUBLISHED_PREDICATE = 'https://www.w3.org/ns/activitystreams#published';
const DESC_ORDER = 'http://semapps.org/ns/core#DescOrder';
const {
  AS_PUBLIC,
  getActivityObject,
  getAuthorityActorUri,
  getInReplyToUri,
  getReplyObjectUri,
  getReplyApprovalUri,
  extractCanReplyState,
  buildReplyDecisionRecipients,
  ensureReplyPolicyContext,
  describeReplyPolicy,
  isReplyObject,
  isMentionedActor,
  isValidApproveReply
} = require('../utils/reply-policies');

const normalizeIri = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** @type {import('moleculer').ServiceSchema} */
module.exports = {
  name: 'reply-policies',

  settings: {
    replyCollectionOptions: {
      path: '/replies',
      attachToTypes: ['Note', 'Article', 'Page'],
      attachPredicate: REPLIES_PREDICATE,
      ordered: true,
      dereferenceItems: true,
      sortPredicate: PUBLISHED_PREDICATE,
      sortOrder: DESC_ORDER,
      permissions: {}
    }
  },

  actions: {
    precheckInboundReply: {
      params: {
        activity: { type: 'object' },
        replyActorUri: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const activity = ctx.params.activity;
        const replyObject = getActivityObject(activity);
        if (!isReplyObject(replyObject)) {
          return { accepted: true, isReply: false, requiresApproval: false, reason: 'not_reply' };
        }

        const replyActorUri =
          normalizeIri(ctx.params.replyActorUri) ||
          normalizeIri(activity.actor) ||
          normalizeIri(replyObject.attributedTo);
        if (!replyActorUri) {
          return { accepted: false, isReply: true, requiresApproval: false, reason: 'missing_reply_actor' };
        }

        const parentObjectUri = getInReplyToUri(replyObject);
        if (!parentObjectUri) {
          return { accepted: true, isReply: false, requiresApproval: false, reason: 'not_reply' };
        }

        const parentObject = await this.loadObject(ctx, parentObjectUri, 'system');
        if (!parentObject) {
          return {
            accepted: true,
            isReply: true,
            requiresApproval: false,
            reason: 'parent_not_found',
            replyActorUri,
            parentObjectUri
          };
        }

        const canReplyState = extractCanReplyState(parentObject);
        if (!canReplyState.isSet) {
          return {
            accepted: true,
            isReply: true,
            requiresApproval: false,
            reason: 'no_policy',
            replyActorUri,
            parentObjectUri
          };
        }

        const authorityUri = getAuthorityActorUri(parentObject);
        const authorityLocal = authorityUri ? this.isAuthorityLocal(authorityUri) : false;

        const verdict = authorityLocal
          ? await this.evaluateLocalAuthorityPermission(ctx, {
              parentObject,
              replyObject,
              replyActorUri,
              authorityUri
            })
          : await this.validateThirdPartyReply(ctx, {
              parentObject,
              replyObject,
              replyActorUri,
              authorityUri
            });

        return {
          ...verdict,
          isReply: true,
          hasPolicy: true,
          authorityLocal,
          authorityUri,
          parentObjectUri,
          replyActorUri,
          requiresApproval: Boolean(verdict.accepted && authorityLocal)
        };
      }
    },

    resolveOutboundReplyPolicy: {
      params: {
        objectUri: { type: 'string' },
        replierActorUri: { type: 'string' },
        webId: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const parentObject = await this.loadObject(
          ctx,
          ctx.params.objectUri,
          ctx.params.webId || ctx.params.replierActorUri
        );
        if (!parentObject) {
          const error = new Error('Reply target could not be resolved');
          error.code = 404;
          error.type = 'REPLY_TARGET_NOT_FOUND';
          throw error;
        }

        const base = describeReplyPolicy(parentObject, ctx.params.replierActorUri);
        const authorityUri = getAuthorityActorUri(parentObject);
        let mayReply = base.mayReply;
        let requiresApproval = base.requiresApproval;
        let reason = base.reason;

        if (base.canReplyIsSet && requiresApproval) {
          const verdict = await this.evaluateLocalAuthorityPermission(ctx, {
            parentObject,
            replyObject: null,
            replyActorUri: ctx.params.replierActorUri,
            authorityUri
          });
          mayReply = verdict.accepted || reason === 'permission_unknown';
          requiresApproval = verdict.accepted;
          reason = verdict.reason || reason;
        }

        return {
          objectUri: ctx.params.objectUri,
          authorityUri,
          policyLabel: base.policyLabel,
          canReplyIsSet: base.canReplyIsSet,
          mayReply,
          requiresApproval,
          reason
        };
      }
    },

    submitReply: {
      params: {
        objectUri: { type: 'string' },
        content: { type: 'string' },
        isPublic: { type: 'boolean', optional: true },
        replierActorUri: { type: 'string' },
        webId: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const { objectUri, content, isPublic = true, replierActorUri } = ctx.params;
        const policy = await ctx.call('reply-policies.resolveOutboundReplyPolicy', {
          objectUri,
          replierActorUri,
          webId: ctx.params.webId || replierActorUri
        });

        if (!policy.mayReply) {
          const error = new Error(policy.policyLabel || 'Reply not allowed');
          error.code = 403;
          error.type = 'REPLY_NOT_ALLOWED';
          throw error;
        }

        const actor = await ctx.call('activitypub.actor.get', { actorUri: replierActorUri });
        if (!actor || !normalizeIri(actor.outbox)) {
          const error = new Error(`Replier actor outbox is not available for ${replierActorUri}`);
          error.code = 404;
          error.type = 'REPLIER_OUTBOX_NOT_FOUND';
          throw error;
        }

        const recipients = policy.requiresApproval
          ? [policy.authorityUri]
          : [
              `${replierActorUri}/followers`,
              ...(isPublic ? [AS_PUBLIC] : []),
              ...(policy.authorityUri ? [policy.authorityUri] : [])
            ];

        const replyObject = {
          '@context': ensureReplyPolicyContext('https://www.w3.org/ns/activitystreams'),
          type: 'Note',
          attributedTo: replierActorUri,
          content: content.trim(),
          inReplyTo: objectUri,
          to: recipients.length === 1 ? recipients[0] : recipients,
          ...(policy.authorityUri
            ? {
                tag: {
                  type: 'Mention',
                  href: policy.authorityUri,
                  name: policy.authorityUri.split('/').filter(Boolean).pop()
                }
              }
            : {})
        };

        const posted = await ctx.call('activitypub.outbox.post', {
          collectionUri: actor.outbox,
          ...replyObject
        });

        return {
          success: true,
          pendingApproval: policy.requiresApproval,
          policyLabel: policy.policyLabel,
          objectUri,
          posted
        };
      }
    },

    approveReply: {
      params: {
        activity: { type: 'object' },
        authorityUri: { type: 'string' },
        parentObjectUri: { type: 'string' },
        replyActorUri: { type: 'string' }
      },
      async handler(ctx) {
        return this.emitApproveReply(ctx, ctx.params);
      }
    },

    rejectReply: {
      params: {
        activity: { type: 'object' },
        authorityUri: { type: 'string', optional: true },
        parentObjectUri: { type: 'string', optional: true },
        replyActorUri: { type: 'string', optional: true }
      },
      async handler(ctx) {
        return this.emitRejectReply(ctx, ctx.params);
      }
    }
  },

  methods: {
    isAuthorityLocal(authorityUri) {
      if (!authorityUri || !CONFIG.BASE_URL) return false;
      return authorityUri.startsWith(CONFIG.BASE_URL);
    },

    async loadObject(ctx, resourceUri, webId) {
      const uri = normalizeIri(resourceUri);
      if (!uri) return null;

      try {
        await ctx.call('ldp.remote.store', {
          resourceUri: uri,
          webId: webId || 'system'
        });
      } catch (error) {
        this.logger.debug('[reply-policies] remote store skipped', { resourceUri: uri, error: error.message });
      }

      try {
        const resource = await ctx.call('ldp.resource.get', {
          resourceUri: uri,
          accept: MIME_TYPES.JSON,
          webId: webId || 'system'
        });
        if (resource && typeof resource === 'object') return resource;
      } catch (error) {
        this.logger.debug('[reply-policies] ldp.resource.get failed', { resourceUri: uri, error: error.message });
      }

      try {
        const actor = await ctx.call('activitypub.actor.get', { actorUri: uri });
        if (actor && typeof actor === 'object') return actor;
      } catch (error) {
        this.logger.debug('[reply-policies] activitypub.actor.get failed', { resourceUri: uri, error: error.message });
      }

      return null;
    },

    async evaluateLocalAuthorityPermission(ctx, { parentObject, replyObject, replyActorUri, authorityUri }) {
      if (isMentionedActor(parentObject, replyActorUri)) {
        return { accepted: true, reason: 'mentioned_actor' };
      }

      const canReplyState = extractCanReplyState(parentObject);
      if (!canReplyState.isSet) {
        return { accepted: true, reason: 'no_policy' };
      }

      if (canReplyState.values.includes(AS_PUBLIC)) {
        return { accepted: true, reason: 'public_replies' };
      }

      if (canReplyState.values.includes(replyActorUri)) {
        return { accepted: true, reason: 'direct_actor_allowed' };
      }

      for (const collectionUri of canReplyState.values) {
        if (!collectionUri || collectionUri === AS_PUBLIC || collectionUri === replyActorUri) continue;
        try {
          const isIncluded = await ctx.call('activitypub.collection.includes', {
            collectionUri,
            itemUri: replyActorUri
          });
          if (isIncluded) {
            return { accepted: true, reason: 'collection_member' };
          }
        } catch (error) {
          this.logger.debug('[reply-policies] collection.includes failed', {
            collectionUri,
            itemUri: replyActorUri,
            error: error.message
          });
        }
      }

      if (!authorityUri && canReplyState.isSet) {
        return { accepted: false, reason: 'missing_authority' };
      }

      return { accepted: false, reason: canReplyState.values.length === 0 ? 'replies_disabled' : 'permission_denied' };
    },

    async validateThirdPartyReply(ctx, { parentObject, replyObject, replyActorUri, authorityUri }) {
      const canReplyState = extractCanReplyState(parentObject);
      if (!canReplyState.isSet) {
        return { accepted: true, reason: 'no_policy' };
      }

      if (canReplyState.values.includes(AS_PUBLIC)) {
        return { accepted: true, reason: 'public_replies' };
      }

      if (isMentionedActor(parentObject, replyActorUri)) {
        return { accepted: true, reason: 'mentioned_actor' };
      }

      const replyApprovalUri = getReplyApprovalUri(replyObject);
      if (!replyApprovalUri) {
        return { accepted: false, reason: 'missing_reply_approval' };
      }

      const approval = await this.loadObject(ctx, replyApprovalUri, 'system');
      if (!approval) {
        return { accepted: false, reason: 'missing_reply_approval' };
      }

      const replyObjectUri = getReplyObjectUri(replyObject);
      const inReplyTo = getInReplyToUri(replyObject);
      if (!isValidApproveReply(approval, { authorityUri, replyObjectUri, inReplyTo })) {
        return { accepted: false, reason: 'invalid_reply_approval' };
      }

      return { accepted: true, reason: 'valid_reply_approval' };
    },

    async ensureRepliesCollection(ctx, parentObject, parentObjectUri) {
      const existingCollectionUri = this.getRepliesCollectionUri(parentObject);
      if (existingCollectionUri) {
        return existingCollectionUri;
      }

      if (!parentObjectUri || !parentObjectUri.startsWith(CONFIG.BASE_URL)) {
        return null;
      }

      try {
        return await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
          objectUri: parentObjectUri,
          collection: this.settings.replyCollectionOptions
        });
      } catch (error) {
        this.logger.debug('[reply-policies] createAndAttachCollection failed', {
          parentObjectUri,
          error: error.message
        });
        return null;
      }
    },

    async emitApproveReply(ctx, { activity, authorityUri, parentObjectUri, replyActorUri }) {
      const replyObject = getActivityObject(activity);
      const replyObjectUri = getReplyObjectUri(replyObject);
      if (!authorityUri || !replyActorUri || !replyObjectUri || !parentObjectUri) return null;

      const authority = await ctx.call('activitypub.actor.get', { actorUri: authorityUri });
      if (!authority || !normalizeIri(authority.outbox)) return null;

      const parentObject = (await this.loadObject(ctx, parentObjectUri, 'system')) || {};
      const repliesCollectionUri = await this.ensureRepliesCollection(ctx, parentObject, parentObjectUri);
      if (!repliesCollectionUri) return null;

      await ctx.call('activitypub.collection.add', {
        collectionUri: repliesCollectionUri,
        itemUri: replyObjectUri
      });

      const recipients = buildReplyDecisionRecipients(parentObject, replyActorUri);
      const activityToSend = {
        '@context': ensureReplyPolicyContext(parentObject['@context']),
        type: 'Add',
        actor: authorityUri,
        object: replyObjectUri,
        target: repliesCollectionUri,
        ...recipients
      };

      return ctx.call('activitypub.outbox.post', {
        collectionUri: authority.outbox,
        ...activityToSend
      });
    },

    async emitRejectReply(ctx, { activity, authorityUri, replyActorUri }) {
      const replyObject = getActivityObject(activity);
      const replyObjectUri = getReplyObjectUri(replyObject);
      const parentObjectUri = getInReplyToUri(replyObject);
      if (!authorityUri || !replyObjectUri) return null;

      const authority = await ctx.call('activitypub.actor.get', { actorUri: authorityUri }).catch(() => null);
      if (!authority || !normalizeIri(authority.outbox)) return null;

      const parentObject = parentObjectUri
        ? (await this.loadObject(ctx, parentObjectUri, 'system')) || {}
        : {};
      const repliesCollectionUri = await this.ensureRepliesCollection(ctx, parentObject, parentObjectUri);
      if (repliesCollectionUri) {
        await ctx.call('activitypub.collection.remove', {
          collectionUri: repliesCollectionUri,
          itemUri: replyObjectUri
        }).catch(() => null);
      }

      const activityToSend = {
        '@context': ensureReplyPolicyContext(parentObject['@context']),
        type: 'Remove',
        actor: authorityUri,
        object: replyObjectUri,
        ...(repliesCollectionUri ? { target: repliesCollectionUri } : {}),
        ...(replyActorUri ? { to: replyActorUri } : {})
      };

      return ctx.call('activitypub.outbox.post', {
        collectionUri: authority.outbox,
        ...activityToSend
      });
    },

    getRepliesCollectionUri(object) {
      return normalizeIri(
        object?.replies ||
        object?.['as:replies'] ||
        object?.[REPLIES_PREDICATE]
      );
    }
  }
};
