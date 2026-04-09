'use strict';

const { hasType } = require('@semapps/ldp');

const OBJECT_BEARING_TYPES = new Set(['Create', 'Update']);

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asArray = value => (Array.isArray(value) ? value : value == null ? [] : [value]);

const normalizeText = value => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeDateTime = value => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizeCount = value => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
};

const isQuestion = object => hasType(object, 'Question');

const getActivityObject = activity => {
  if (!isObject(activity)) return null;
  const isWrapped = OBJECT_BEARING_TYPES.has(activity.type) || OBJECT_BEARING_TYPES.has(activity['@type']);
  if (isWrapped && isObject(activity.object)) return activity.object;
  return activity;
};

const extractVoteOptionName = object =>
  normalizeText(object.name)
  || normalizeText(object.option)
  || normalizeText(object.choice)
  || null;

const isVoteNote = object => {
  if (!isObject(object) || !hasType(object, 'Note')) return false;
  const inReplyTo = normalizeText(object.inReplyTo);
  const optionName = extractVoteOptionName(object);
  return Boolean(inReplyTo && optionName);
};

const toNormalizedPollOption = option => {
  if (typeof option === 'string') {
    const name = normalizeText(option);
    if (!name) return null;
    return {
      type: 'Note',
      name,
      replies: {
        type: 'Collection',
        totalItems: 0,
      },
    };
  }

  if (!isObject(option)) return null;

  const name = normalizeText(option.name);
  if (!name) return null;

  const repliesSource = isObject(option.replies) ? option.replies : {};
  const normalized = {
    type: 'Note',
    name,
    replies: {
      type: 'Collection',
      totalItems: normalizeCount(repliesSource.totalItems),
    },
  };

  return normalized;
};

const normalizePollOptions = object => {
  const sourceOptions = Array.isArray(object.oneOf)
    ? object.oneOf
    : Array.isArray(object.anyOf)
      ? object.anyOf
      : [];

  const uniqueNames = new Set();
  const options = [];

  for (const sourceOption of sourceOptions) {
    const option = toNormalizedPollOption(sourceOption);
    if (!option) continue;
    if (uniqueNames.has(option.name)) continue;
    uniqueNames.add(option.name);
    options.push(option);
  }

  if (options.length === 0) {
    return {
      options: null,
      mode: null,
    };
  }

  const mode = Array.isArray(object.anyOf) ? 'anyOf' : 'oneOf';
  return {
    options,
    mode,
  };
};

const normalizeQuestionObject = (object, { now, ensureUpdated }) => {
  if (!isQuestion(object)) return object;

  const { options, mode } = normalizePollOptions(object);
  if (!options || !mode) return object;

  const normalizedEndTime = normalizeDateTime(object.endTime);
  const normalizedClosed = normalizeDateTime(object.closed);
  const effectiveEnd = normalizedEndTime || normalizedClosed;

  const normalized = { ...object };
  delete normalized.oneOf;
  delete normalized.anyOf;
  normalized[mode] = options;

  if (effectiveEnd) {
    normalized.endTime = effectiveEnd;
    normalized.closed = effectiveEnd;
  } else {
    delete normalized.endTime;
    delete normalized.closed;
  }

  if (ensureUpdated) {
    const updated = normalizeDateTime(object.updated) || now().toISOString();
    normalized.updated = updated;
  }

  return normalized;
};

const normalizeVoteObject = object => {
  if (!isVoteNote(object)) return object;

  const inReplyTo = normalizeText(object.inReplyTo);
  const name = extractVoteOptionName(object);
  if (!inReplyTo || !name) return object;

  const normalized = {
    ...object,
    type: 'Note',
    inReplyTo,
    name,
  };

  delete normalized.content;
  delete normalized.option;
  delete normalized.choice;

  return normalized;
};

const normalizePollObject = (object, options = {}) => {
  if (!isObject(object)) return object;

  const normalizedQuestion = normalizeQuestionObject(object, {
    now: options.now || (() => new Date()),
    ensureUpdated: options.ensureUpdated === true,
  });
  const normalizedVote = normalizeVoteObject(normalizedQuestion);
  return normalizedVote;
};

const normalizePollActivity = (activity, options = {}) => {
  if (!isObject(activity)) return activity;

  const isWrapped = OBJECT_BEARING_TYPES.has(activity.type) || OBJECT_BEARING_TYPES.has(activity['@type']);
  if (isWrapped && isObject(activity.object)) {
    const ensureUpdated = activity.type === 'Update' || activity['@type'] === 'Update';
    const normalizedObject = normalizePollObject(activity.object, {
      now: options.now,
      ensureUpdated,
    });
    if (normalizedObject === activity.object) return activity;
    return {
      ...activity,
      object: normalizedObject,
    };
  }

  return normalizePollObject(activity, {
    now: options.now,
  });
};

module.exports = {
  isVoteNote,
  isQuestion,
  getActivityObject,
  normalizePollObject,
  normalizePollActivity,
};
