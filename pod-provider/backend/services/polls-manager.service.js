"use strict";

const { AS_PUBLIC } = require('../utils/search-consent');
const { normalizePollActivity, getActivityObject, isQuestion, isVoteNote } = require('../utils/polls');

const asArray = value => (Array.isArray(value) ? value : value == null ? [] : [value]);

const normalizeActorUri = value => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.trim()) return value.id.trim();
  return null;
};

const normalizeId = value => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeDate = value => {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

module.exports = {
  name: 'polls-manager',

  created() {
    this.pollStateById = new Map();
  },

  events: {
    'activitypub.outbox.posted': {
      async handler(ctx) {
        const { activity } = ctx.params || {};
        await this.registerPollFromActivity(ctx, activity);
      },
    },
  },

  actions: {
    precheckInboundVote: {
      params: {
        activity: { type: 'object' },
        voterActorUri: { type: 'string', optional: true },
      },
      async handler(ctx) {
        const normalizedActivity = normalizePollActivity(ctx.params.activity);
        const vote = this.extractVote(normalizedActivity);
        if (!vote) {
          return { accepted: true, reason: null, isVote: false };
        }

        const voterActorUri = normalizeActorUri(ctx.params.voterActorUri) || vote.attributedTo;
        if (!voterActorUri) {
          return { accepted: false, reason: 'missing_voter_actor', isVote: true };
        }

        const poll = this.pollStateById.get(vote.pollId);
        if (!poll) {
          return { accepted: false, reason: 'poll_not_found', isVote: true };
        }

        const verdict = await this.evaluateVote(ctx, poll, vote, voterActorUri);
        return {
          accepted: verdict.accepted,
          reason: verdict.reason,
          isVote: true,
        };
      },
    },

    commitInboundVote: {
      params: {
        activity: { type: 'object' },
        voterActorUri: { type: 'string', optional: true },
      },
      async handler(ctx) {
        const normalizedActivity = normalizePollActivity(ctx.params.activity);
        const vote = this.extractVote(normalizedActivity);
        if (!vote) {
          return { accepted: false, reason: 'not_vote', isVote: false };
        }

        const voterActorUri = normalizeActorUri(ctx.params.voterActorUri) || vote.attributedTo;
        if (!voterActorUri) {
          return { accepted: false, reason: 'missing_voter_actor', isVote: true };
        }

        const poll = this.pollStateById.get(vote.pollId);
        if (!poll) {
          return { accepted: false, reason: 'poll_not_found', isVote: true };
        }

        const verdict = await this.evaluateVote(ctx, poll, vote, voterActorUri);
        if (!verdict.accepted) {
          return { accepted: false, reason: verdict.reason, isVote: true };
        }

        const option = poll.options.find(entry => entry.name === vote.optionName);
        if (!option) {
          return { accepted: false, reason: 'option_not_found', isVote: true };
        }

        option.totalItems += 1;
        poll.voteIds.add(vote.voteId);
        if (!poll.voterChoices.has(voterActorUri)) {
          poll.voterChoices.set(voterActorUri, new Set());
        }
        poll.voterChoices.get(voterActorUri).add(vote.optionName);
        poll.voters.add(voterActorUri);
        poll.updatedAt = new Date().toISOString();

        const updateActivity = this.buildPollUpdateActivity(poll);
        await this.publishPollUpdate(ctx, poll, updateActivity);

        return {
          accepted: true,
          reason: null,
          isVote: true,
          updateActivityId: updateActivity.id || null,
        };
      },
    },

    registerOutboundPoll: {
      params: {
        activity: { type: 'object' },
      },
      async handler(ctx) {
        const normalized = normalizePollActivity(ctx.params.activity);
        return this.registerPollFromActivity(ctx, normalized);
      },
    },
  },

  methods: {
    async registerPollFromActivity(ctx, activity) {
      if (!activity || typeof activity !== 'object') return { registered: false, reason: 'invalid_activity' };

      const normalized = normalizePollActivity(activity);
      const object = getActivityObject(normalized);
      if (!object || !isQuestion(object)) {
        return { registered: false, reason: 'not_question' };
      }

      const pollId = normalizeId(object.id);
      const author = normalizeActorUri(object.attributedTo || normalized.actor);
      if (!pollId || !author) {
        return { registered: false, reason: 'missing_poll_identity' };
      }

      const mode = Array.isArray(object.anyOf) ? 'anyOf' : Array.isArray(object.oneOf) ? 'oneOf' : null;
      const optionsSource = mode === 'anyOf' ? object.anyOf : mode === 'oneOf' ? object.oneOf : [];
      const options = asArray(optionsSource)
        .filter(option => option && typeof option === 'object' && typeof option.name === 'string')
        .map(option => ({
          name: option.name.trim(),
          totalItems: Number(option.replies?.totalItems) >= 0 ? Math.floor(Number(option.replies.totalItems)) : 0,
        }))
        .filter(option => option.name.length > 0);

      if (!mode || options.length === 0) {
        return { registered: false, reason: 'invalid_poll_shape' };
      }

      const previous = this.pollStateById.get(pollId);
      const nextOptionNames = options.map(option => option.name);
      const modeChanged = previous && previous.mode !== mode;
      const optionNamesChanged = previous && JSON.stringify(previous.options.map(o => o.name)) !== JSON.stringify(nextOptionNames);
      const shouldResetVotes = Boolean(modeChanged || optionNamesChanged);

      const audience = this.extractAudience(object, normalized);
      const endTime = normalizeDate(object.endTime || object.closed);

      const state = {
        pollId,
        author,
        mode,
        options: options.map(option => ({ ...option })),
        endTime,
        audience,
        audiencePublic: audience.includes(AS_PUBLIC),
        to: asArray(object.to).filter(value => typeof value === 'string'),
        cc: asArray(object.cc).filter(value => typeof value === 'string'),
        voteIds: shouldResetVotes || !previous ? new Set() : previous.voteIds,
        voterChoices: shouldResetVotes || !previous ? new Map() : previous.voterChoices,
        voters: shouldResetVotes || !previous ? new Set() : previous.voters,
        updatedAt: normalizeDate(object.updated) || new Date().toISOString(),
      };

      if (!shouldResetVotes && previous) {
        const optionCountByName = new Map(state.options.map(option => [option.name, option]));
        for (const oldOption of previous.options) {
          const next = optionCountByName.get(oldOption.name);
          if (next) next.totalItems = oldOption.totalItems;
        }
      }

      this.pollStateById.set(pollId, state);
      return { registered: true, pollId, resetVotes: shouldResetVotes };
    },

    extractVote(activity) {
      if (!activity || typeof activity !== 'object') return null;
      const object = getActivityObject(activity);
      if (!object || !isVoteNote(object)) return null;

      const voteId = normalizeId(object.id);
      const pollId = normalizeId(object.inReplyTo);
      const optionName = typeof object.name === 'string' ? object.name.trim() : '';
      const attributedTo = normalizeActorUri(object.attributedTo || activity.actor);

      if (!voteId || !pollId || !optionName) return null;
      return {
        voteId,
        pollId,
        optionName,
        attributedTo,
      };
    },

    async evaluateVote(ctx, poll, vote, voterActorUri) {
      if (!poll || !vote) return { accepted: false, reason: 'invalid_vote' };
      if (poll.voteIds.has(vote.voteId)) return { accepted: false, reason: 'duplicate_vote_id' };

      if (!poll.audiencePublic && voterActorUri !== poll.author) {
        const hasPermission = await this.isActorAllowedByAudience(ctx, poll, voterActorUri);
        if (!hasPermission) {
          return { accepted: false, reason: 'permission_denied' };
        }
      }

      if (poll.endTime) {
        const end = new Date(poll.endTime).getTime();
        if (Number.isFinite(end) && Date.now() > end) {
          return { accepted: false, reason: 'poll_closed' };
        }
      }

      const option = poll.options.find(entry => entry.name === vote.optionName);
      if (!option) return { accepted: false, reason: 'option_not_found' };

      const voterChoices = poll.voterChoices.get(voterActorUri) || new Set();
      if (poll.mode === 'oneOf' && voterChoices.size > 0) {
        return { accepted: false, reason: 'single_choice_already_voted' };
      }
      if (voterChoices.has(vote.optionName)) {
        return { accepted: false, reason: 'duplicate_vote_name' };
      }

      return { accepted: true, reason: null };
    },

    async isActorAllowedByAudience(ctx, poll, actorUri) {
      if (poll.audience.includes(actorUri)) {
        return true;
      }

      for (const audienceEntry of poll.audience) {
        if (!this.looksLikeCollectionUri(audienceEntry)) {
          continue;
        }

        try {
          const isMember = await ctx.call('activitypub.collection.includes', {
            collectionUri: audienceEntry,
            itemUri: actorUri,
          });
          if (Boolean(isMember)) {
            return true;
          }
        } catch (error) {
          this.logger.warn('[polls-manager] audience collection membership check failed', {
            pollId: poll.pollId,
            collectionUri: audienceEntry,
            actorUri,
            error: error.message,
          });
        }
      }

      return false;
    },

    looksLikeCollectionUri(value) {
      return (
        typeof value === 'string'
        && (value.includes('/followers')
          || value.includes('/following')
          || value.includes('/contacts')
          || value.includes('/contactRequests')
          || value.includes('/collections/'))
      );
    },

    extractAudience(question, activity) {
      const audience = new Set();
      for (const field of ['to', 'cc', 'bto', 'bcc', 'audience']) {
        for (const value of asArray(question[field] ?? activity[field])) {
          if (typeof value === 'string' && value.trim()) audience.add(value.trim());
        }
      }
      return [...audience];
    },

    buildPollUpdateActivity(poll) {
      const questionObject = {
        id: poll.pollId,
        type: 'Question',
        attributedTo: poll.author,
        updated: poll.updatedAt,
        ...(poll.endTime ? { endTime: poll.endTime, closed: poll.endTime } : {}),
        ...(poll.to.length > 0 ? { to: poll.to } : {}),
        ...(poll.cc.length > 0 ? { cc: poll.cc } : {}),
        [poll.mode]: poll.options.map(option => ({
          type: 'Note',
          name: option.name,
          replies: {
            type: 'Collection',
            totalItems: option.totalItems,
          },
        })),
      };

      return {
        type: 'Update',
        actor: poll.author,
        to: [...new Set([...poll.to, ...poll.voters])],
        cc: [...new Set([...poll.cc, ...poll.voters])],
        object: questionObject,
      };
    },

    async publishPollUpdate(ctx, poll, activity) {
      const authorActor = await ctx.call('activitypub.actor.get', { actorUri: poll.author });
      const outbox = authorActor?.outbox;
      if (!outbox) {
        this.logger.warn('[polls-manager] Could not resolve author outbox for poll update', {
          pollId: poll.pollId,
          author: poll.author,
        });
        return;
      }

      await ctx.call('activitypub.outbox.post', {
        collectionUri: outbox,
        ...activity,
      });
    },
  },
};
