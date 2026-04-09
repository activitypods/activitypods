'use strict';

const { normalizePollActivity, getActivityObject, isQuestion, isVoteNote } = require('../utils/polls');

const isCreateOrUpdate = activity => {
  if (!activity || typeof activity !== 'object') return false;
  return (
    activity.type === 'Create' ||
    activity.type === 'Update' ||
    activity['@type'] === 'Create' ||
    activity['@type'] === 'Update'
  );
};

const PollsMiddleware = () => ({
  name: 'PollsMiddleware',
  localAction: (next, action) => {
    if (action.name !== 'activitypub.outbox.post' && action.name !== 'activitypub.inbox.post') {
      return next;
    }

    return async ctx => {
      if (!ctx.params || typeof ctx.params !== 'object') {
        return next(ctx);
      }

      const { collectionUri, ...activity } = ctx.params;
      const normalized = normalizePollActivity(activity);
      const object = getActivityObject(normalized);
      const isVoteActivity = isCreateOrUpdate(normalized) && object && isVoteNote(object);
      const isQuestionActivity = isCreateOrUpdate(normalized) && object && isQuestion(object);

      if (normalized !== activity) {
        ctx.params = collectionUri ? { collectionUri, ...normalized } : normalized;
      }

      const canCallServices = typeof ctx.call === 'function';

      if (canCallServices && action.name === 'activitypub.inbox.post' && isVoteActivity) {
        const precheck = await ctx.call('polls-manager.precheckInboundVote', {
          activity: normalized,
          voterActorUri: typeof ctx.meta?.webId === 'string' ? ctx.meta.webId : undefined
        });
        if (!precheck.accepted) {
          return null;
        }
      }

      const result = await next(ctx);

      if (canCallServices && action.name === 'activitypub.outbox.post' && isQuestionActivity) {
        await ctx.call('polls-manager.registerOutboundPoll', {
          activity: normalized
        });
      }

      if (canCallServices && action.name === 'activitypub.inbox.post' && isVoteActivity) {
        await ctx.call('polls-manager.commitInboundVote', {
          activity: normalized,
          voterActorUri: typeof ctx.meta?.webId === 'string' ? ctx.meta.webId : undefined
        });
      }

      return result;
    };
  }
});

module.exports = PollsMiddleware;
