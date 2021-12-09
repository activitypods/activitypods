const { ACTIVITY_TYPES } = require('@semapps/activitypub');

const INVITE_EVENT = {
  type: ACTIVITY_TYPES.INVITE,
  object: {
    type: 'pair:Event'
  }
};

const OFFER_INVITE_EVENT = {
  type: ACTIVITY_TYPES.OFFER,
  object: {
    type: ACTIVITY_TYPES.INVITE,
    object: {
      type: 'pair:Event'
    }
  }
};

const JOIN_EVENT = {
  type: ACTIVITY_TYPES.JOIN,
  object: {
    type: 'pair:Event'
  }
};

const LEAVE_EVENT = {
  type: ACTIVITY_TYPES.LEAVE,
  object: {
    type: 'pair:Event'
  }
};

const ANNOUNCE_UPDATE_EVENT = {
  type: ACTIVITY_TYPES.ANNOUNCE,
  object: {
    type: ACTIVITY_TYPES.UPDATE,
    object: {
      type: 'pair:Event'
    }
  }
};

module.exports = {
  INVITE_EVENT,
  OFFER_INVITE_EVENT,
  JOIN_EVENT,
  LEAVE_EVENT,
  ANNOUNCE_UPDATE_EVENT
};
