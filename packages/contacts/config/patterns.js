const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { ACTOR_TYPES } = require('@semapps/activitypub/constants');
const matchActivity = require('@semapps/activitypub/utils/matchActivity');

const CONTACT_REQUEST = (ctx, activity) => {
  // The context indicates that the contact request was sent with an invite capability => automatic accept.
  if (activity.context || activity['as:context']) {
    return false;
  }

  return matchActivity({
    type: ACTIVITY_TYPES.OFFER,
    object: {
      type: ACTIVITY_TYPES.ADD,
      object: {
        type: OBJECT_TYPES.PROFILE
      }
    }
  });
};

const ACCEPT_CONTACT_REQUEST = (ctx, activity) => {
  // The context indicates that the contact request was sent with an invite capability => automatic accept.
  if (activity.context || activity['as:context']) {
    return false;
  }

  return matchActivity({
    type: ACTIVITY_TYPES.ACCEPT,
    object: {
      type: ACTIVITY_TYPES.OFFER,
      object: {
        type: ACTIVITY_TYPES.ADD,
        object: {
          type: OBJECT_TYPES.PROFILE
        }
      }
    }
  });
};

const AUTO_ACCEPTED_CONTACT_REQUEST = (ctx, activity) => {
  // No context indicates that the contact request was not sent with an invite capability.
  if (!activity.context && !activity['as:context']) {
    return false;
  }

  return matchActivity({
    type: ACTIVITY_TYPES.OFFER,
    object: {
      type: ACTIVITY_TYPES.ADD,
      object: {
        type: OBJECT_TYPES.PROFILE
      }
    }
  });
};

const IGNORE_CONTACT_REQUEST = {
  type: ACTIVITY_TYPES.IGNORE,
  object: {
    type: ACTIVITY_TYPES.OFFER,
    object: {
      type: ACTIVITY_TYPES.ADD,
      object: {
        type: OBJECT_TYPES.PROFILE
      }
    }
  }
};

const REJECT_CONTACT_REQUEST = {
  type: ACTIVITY_TYPES.REJECT,
  object: {
    type: ACTIVITY_TYPES.OFFER,
    object: {
      type: ACTIVITY_TYPES.ADD,
      object: {
        type: OBJECT_TYPES.PROFILE
      }
    }
  }
};

const REMOVE_CONTACT = {
  type: ACTIVITY_TYPES.REMOVE,
  object: {
    type: ACTOR_TYPES.PERSON
  }
};

const IGNORE_CONTACT = {
  type: ACTIVITY_TYPES.IGNORE,
  object: {
    type: ACTOR_TYPES.PERSON
  }
};

const UNDO_IGNORE_CONTACT = {
  type: ACTIVITY_TYPES.UNDO,
  object: IGNORE_CONTACT
};

const OFFER_DELETE_ACTOR = {
  type: ACTIVITY_TYPES.OFFER,
  object: {
    type: ACTIVITY_TYPES.DELETE,
    object: {
      type: ACTOR_TYPES.PERSON
    }
  }
};

module.exports = {
  CONTACT_REQUEST,
  ACCEPT_CONTACT_REQUEST,
  AUTO_ACCEPTED_CONTACT_REQUEST,
  IGNORE_CONTACT_REQUEST,
  REJECT_CONTACT_REQUEST,
  REMOVE_CONTACT,
  IGNORE_CONTACT,
  UNDO_IGNORE_CONTACT,
  OFFER_DELETE_ACTOR
};
