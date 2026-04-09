'use strict';

const { isReplyActivity, normalizeReplyPolicyActivity } = require('../utils/reply-policies');

const ReplyPoliciesMiddleware = () => ({
  name: 'ReplyPoliciesMiddleware',
  localAction: (next, action) => {
    if (action.name !== 'activitypub.outbox.post' && action.name !== 'activitypub.inbox.post') {
      return next;
    }

    return async ctx => {
      if (!ctx.params || typeof ctx.params !== 'object') {
        return next(ctx);
      }

      const { collectionUri, ...activity } = ctx.params;
      const normalized = normalizeReplyPolicyActivity(activity);
      if (normalized !== activity) {
        ctx.params = collectionUri ? { collectionUri, ...normalized } : normalized;
      }

      const canCallServices = typeof ctx.call === 'function';
      let replyVerdict = null;

      if (canCallServices && action.name === 'activitypub.inbox.post' && isReplyActivity(normalized)) {
        replyVerdict = await ctx.call('reply-policies.precheckInboundReply', {
          activity: normalized,
          replyActorUri: typeof ctx.meta?.webId === 'string' ? ctx.meta.webId : undefined,
        });

        if (!replyVerdict.accepted) {
          if (replyVerdict.authorityLocal && replyVerdict.authorityUri) {
            await ctx.call('reply-policies.rejectReply', {
              activity: normalized,
              authorityUri: replyVerdict.authorityUri,
              parentObjectUri: replyVerdict.parentObjectUri,
              replyActorUri: replyVerdict.replyActorUri,
            });
          }
          return null;
        }
      }

      const result = await next(ctx);

      if (canCallServices && action.name === 'activitypub.inbox.post' && replyVerdict && replyVerdict.requiresApproval) {
        await ctx.call('reply-policies.approveReply', {
          activity: normalized,
          authorityUri: replyVerdict.authorityUri,
          parentObjectUri: replyVerdict.parentObjectUri,
          replyActorUri: replyVerdict.replyActorUri,
        });
      }

      return result;
    };
  },
});

module.exports = ReplyPoliciesMiddleware;