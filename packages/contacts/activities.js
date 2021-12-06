const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');

export const OFFER_ADD_PROFILE_ACTIVITY = {
  type: ACTIVITY_TYPES.OFFER,
  object: {
    type: ACTIVITY_TYPES.ADD,
    object: {
      type: OBJECT_TYPES.PROFILE
    }
  }
};

export const ACCEPT_OFFER_ADD_PROFILE_ACTIVITY = {
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
};

export const REJECT_OFFER_ADD_PROFILE_ACTIVITY = {
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
