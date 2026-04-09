'use strict';

const AS_PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
const AS_PUBLIC_ALIASES = new Set([AS_PUBLIC, 'as:Public', 'Public']);
const TOOT_NS = 'http://joinmastodon.org/ns#';
const CAN_REPLY_IRI = `${TOOT_NS}canReply`;
const REPLY_APPROVAL_IRI = `${TOOT_NS}replyApproval`;
const APPROVE_REPLY_IRI = `${TOOT_NS}ApproveReply`;
const REJECT_REPLY_IRI = `${TOOT_NS}RejectReply`;
const REPLY_OBJECT_TYPES = new Set(['Note', 'Article', 'Page']);
const OBJECT_BEARING_TYPES = new Set(['Create', 'Update']);

const REPLY_POLICY_CONTEXT = {
  toot: TOOT_NS,
  canReply: 'toot:canReply',
  replyApproval: 'toot:replyApproval',
  ApproveReply: 'toot:ApproveReply',
  RejectReply: 'toot:RejectReply'
};

const toArray = value => (Array.isArray(value) ? value : value != null ? [value] : []);

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeIri = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (AS_PUBLIC_ALIASES.has(trimmed)) return AS_PUBLIC;
  return trimmed.startsWith('http') ? trimmed : null;
};

const unique = values => [...new Set(values.filter(Boolean))];

const hasType = (value, type) => toArray(value).includes(type);

const isReplyControlledObject = object => {
  if (!isObject(object)) return false;
  return [...REPLY_OBJECT_TYPES].some(type => hasType(object.type || object['@type'], type));
};

const getActivityObject = activity => {
  if (!isObject(activity)) return null;
  const type = activity.type || activity['@type'];
  if (OBJECT_BEARING_TYPES.has(type) && isObject(activity.object)) return activity.object;
  return activity;
};

const normalizeEntityIri = value => {
  if (typeof value === 'string') return normalizeIri(value);
  if (isObject(value)) {
    return normalizeIri(value.id || value['@id'] || value.href || value.url);
  }
  return null;
};

const getReplyObjectUri = object => normalizeEntityIri(object && (object.id || object['@id']));

const getInReplyToUri = object => normalizeEntityIri(object && object.inReplyTo);

const getAuthorityActorUri = object => normalizeEntityIri(object && object.attributedTo);

const getReplyApprovalUri = object => {
  if (!isObject(object)) return null;
  return normalizeEntityIri(object.replyApproval || object[REPLY_APPROVAL_IRI]);
};

const extractCanReplyState = object => {
  if (!isObject(object)) return { isSet: false, values: [] };

  const raw = Object.prototype.hasOwnProperty.call(object, 'canReply') ? object.canReply : object[CAN_REPLY_IRI];

  if (raw === undefined) return { isSet: false, values: [] };
  if (Array.isArray(raw) && raw.length === 0) return { isSet: true, values: [] };

  const values = unique(toArray(raw).map(normalizeEntityIri).filter(Boolean));

  return { isSet: true, values };
};

const extractMentionedActors = object =>
  unique(
    toArray(object && object.tag)
      .filter(tag => isObject(tag) && hasType(tag.type || tag['@type'], 'Mention'))
      .map(tag => normalizeEntityIri(tag.href || tag.id || tag['@id']))
      .filter(Boolean)
  );

const normalizeCanReplyForOutput = (values, isSet) => {
  if (!isSet) return undefined;
  if (values.length === 0) return [];
  return values.length === 1 ? values[0] : values;
};

const hasReplyPolicyContext = context => {
  if (!context) return false;
  if (Array.isArray(context)) return context.some(hasReplyPolicyContext);
  if (typeof context === 'string') return context === TOOT_NS;
  return isObject(context) && (context.canReply === 'toot:canReply' || context.replyApproval === 'toot:replyApproval');
};

const ensureReplyPolicyContext = value => {
  if (!value) return ['https://www.w3.org/ns/activitystreams', REPLY_POLICY_CONTEXT];
  if (hasReplyPolicyContext(value)) return value;
  if (typeof value === 'string') return [value, REPLY_POLICY_CONTEXT];
  if (Array.isArray(value)) return [...value, REPLY_POLICY_CONTEXT];
  return [value, REPLY_POLICY_CONTEXT];
};

const isApproveReplyActivity = activity => {
  if (!isObject(activity)) return false;
  return [APPROVE_REPLY_IRI, 'ApproveReply', 'toot:ApproveReply'].includes(activity.type || activity['@type']);
};

const isRejectReplyActivity = activity => {
  if (!isObject(activity)) return false;
  return [REJECT_REPLY_IRI, 'RejectReply', 'toot:RejectReply'].includes(activity.type || activity['@type']);
};

const isReplyObject = object => isReplyControlledObject(object) && Boolean(getInReplyToUri(object));

const isReplyActivity = activity => {
  const object = getActivityObject(activity);
  return isReplyObject(object);
};

const isMentionedActor = (object, actorUri) => extractMentionedActors(object).includes(actorUri);

const normalizeReplyPolicyObject = object => {
  if (!isReplyControlledObject(object)) return object;

  const canReplyState = extractCanReplyState(object);
  const replyApprovalUri = getReplyApprovalUri(object);
  const hasReplyPolicy = canReplyState.isSet || Boolean(replyApprovalUri);
  if (!hasReplyPolicy) return object;

  const result = { ...object };
  let changed = false;

  if (canReplyState.isSet) {
    const mergedCanReply =
      canReplyState.values.length > 0 ? unique([...canReplyState.values, ...extractMentionedActors(object)]) : [];
    const normalizedOutput = normalizeCanReplyForOutput(mergedCanReply, true);

    if (
      JSON.stringify(object.canReply) !== JSON.stringify(normalizedOutput) ||
      Object.prototype.hasOwnProperty.call(object, CAN_REPLY_IRI)
    ) {
      result.canReply = normalizedOutput;
      delete result[CAN_REPLY_IRI];
      changed = true;
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(object, 'replyApproval') ||
    Object.prototype.hasOwnProperty.call(object, REPLY_APPROVAL_IRI)
  ) {
    if (replyApprovalUri) {
      if (
        result.replyApproval !== replyApprovalUri ||
        Object.prototype.hasOwnProperty.call(result, REPLY_APPROVAL_IRI)
      ) {
        result.replyApproval = replyApprovalUri;
        delete result[REPLY_APPROVAL_IRI];
        changed = true;
      }
    } else {
      delete result.replyApproval;
      delete result[REPLY_APPROVAL_IRI];
      changed = true;
    }
  }

  const normalizedContext = ensureReplyPolicyContext(result['@context']);
  if (JSON.stringify(normalizedContext) !== JSON.stringify(result['@context'])) {
    result['@context'] = normalizedContext;
    changed = true;
  }

  return changed ? result : object;
};

const normalizeReplyDecisionActivity = activity => {
  if (!isApproveReplyActivity(activity) && !isRejectReplyActivity(activity)) return activity;

  const result = { ...activity };
  let changed = false;

  const objectUri = normalizeEntityIri(activity.object);
  if (objectUri && activity.object !== objectUri) {
    result.object = objectUri;
    changed = true;
  }

  if (isApproveReplyActivity(activity)) {
    const inReplyToUri = normalizeEntityIri(activity.inReplyTo);
    if (inReplyToUri && activity.inReplyTo !== inReplyToUri) {
      result.inReplyTo = inReplyToUri;
      changed = true;
    }
  }

  const normalizedContext = ensureReplyPolicyContext(result['@context']);
  if (JSON.stringify(normalizedContext) !== JSON.stringify(result['@context'])) {
    result['@context'] = normalizedContext;
    changed = true;
  }

  return changed ? result : activity;
};

const normalizeReplyPolicyActivity = activity => {
  if (!isObject(activity)) return activity;

  const normalizedDecision = normalizeReplyDecisionActivity(activity);
  if (normalizedDecision !== activity) return normalizedDecision;

  const object = getActivityObject(activity);
  if (!object) return activity;

  const normalizedObject = normalizeReplyPolicyObject(object);
  if (normalizedObject === object) return activity;
  if (object === activity) return normalizedObject;
  return { ...activity, object: normalizedObject };
};

const buildReplyDecisionRecipients = (parentObject, replyActorUri) => {
  const to = unique([...toArray(parentObject && parentObject.to), replyActorUri]);
  const cc = unique(toArray(parentObject && parentObject.cc));
  return {
    to: to.length === 1 ? to[0] : to,
    cc: cc.length === 0 ? undefined : cc.length === 1 ? cc[0] : cc
  };
};

const describeReplyPolicy = (object, actorUri = null) => {
  const canReplyState = extractCanReplyState(object);
  const authorityUri = getAuthorityActorUri(object);

  if (!canReplyState.isSet) {
    return {
      canReplyIsSet: false,
      policyLabel: 'Replies allowed',
      requiresApproval: false,
      mayReply: true,
      reason: 'no_policy',
      authorityUri
    };
  }

  if (canReplyState.values.length === 0) {
    return {
      canReplyIsSet: true,
      policyLabel: 'Replies disabled',
      requiresApproval: false,
      mayReply: false,
      reason: 'replies_disabled',
      authorityUri
    };
  }

  if (isMentionedActor(object, actorUri || '')) {
    return {
      canReplyIsSet: true,
      policyLabel: 'Only mentioned users can reply',
      requiresApproval: false,
      mayReply: true,
      reason: 'mentioned_actor',
      authorityUri
    };
  }

  if (canReplyState.values.includes(AS_PUBLIC)) {
    return {
      canReplyIsSet: true,
      policyLabel: 'Anyone can reply',
      requiresApproval: false,
      mayReply: true,
      reason: 'public_replies',
      authorityUri
    };
  }

  if (actorUri && canReplyState.values.includes(actorUri)) {
    return {
      canReplyIsSet: true,
      policyLabel: 'Only selected users can reply',
      requiresApproval: true,
      mayReply: true,
      reason: 'direct_actor_allowed',
      authorityUri
    };
  }

  const labels = canReplyState.values
    .filter(uri => uri !== actorUri)
    .map(uri => {
      if (uri.endsWith('/followers')) return 'followers';
      if (uri.endsWith('/following')) return 'people this author follows';
      return 'selected users';
    });

  return {
    canReplyIsSet: true,
    policyLabel: `Only ${unique(labels).join(' and ')} can reply`,
    requiresApproval: true,
    mayReply: false,
    reason: 'permission_unknown',
    authorityUri
  };
};

const isValidApproveReply = (approval, options = {}) => {
  if (!isApproveReplyActivity(approval)) return false;

  const { authorityUri, replyObjectUri, inReplyTo } = options;
  const approvalActor = normalizeEntityIri(approval.actor);
  const approvalObject = normalizeEntityIri(approval.object);
  const approvalInReplyTo = normalizeEntityIri(approval.inReplyTo);

  if (!approvalActor || !approvalObject || !approvalInReplyTo) return false;
  if (authorityUri && approvalActor !== authorityUri) return false;
  if (replyObjectUri && approvalObject !== replyObjectUri) return false;
  if (inReplyTo && approvalInReplyTo !== inReplyTo) return false;

  return true;
};

module.exports = {
  AS_PUBLIC,
  CAN_REPLY_IRI,
  REPLY_APPROVAL_IRI,
  APPROVE_REPLY_IRI,
  REJECT_REPLY_IRI,
  getActivityObject,
  getReplyObjectUri,
  getInReplyToUri,
  getAuthorityActorUri,
  getReplyApprovalUri,
  extractCanReplyState,
  extractMentionedActors,
  ensureReplyPolicyContext,
  normalizeReplyPolicyObject,
  normalizeReplyDecisionActivity,
  normalizeReplyPolicyActivity,
  normalizeCanReplyForOutput,
  buildReplyDecisionRecipients,
  describeReplyPolicy,
  isReplyObject,
  isReplyActivity,
  isApproveReplyActivity,
  isRejectReplyActivity,
  isMentionedActor,
  isValidApproveReply
};
