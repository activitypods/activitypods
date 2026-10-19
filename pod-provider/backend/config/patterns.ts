import { ACTIVITY_TYPES, OBJECT_TYPES, matchActivity } from '@semapps/activitypub';
import { ACTOR_TYPES } from '@semapps/activitypub/constants';

const CONTACT_REQUEST = {
  type: ACTIVITY_TYPES.OFFER,
  object: {
    type: ACTIVITY_TYPES.ADD,
    object: {
      type: OBJECT_TYPES.PROFILE
    }
  }
};

const ACCEPT_CONTACT_REQUEST = {
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

// Groups also send Add/Remove of persons to their members, but without origin
const withOrigin = (pattern: object) => (activity: any, fetcher: any) =>
  activity.origin ? matchActivity(pattern, activity, fetcher) : { match: false, dereferencedActivity: activity };

const ADD_CONTACT = withOrigin({
  type: ACTIVITY_TYPES.ADD,
  object: {
    type: ACTOR_TYPES.PERSON
  }
});

const REMOVE_CONTACT = withOrigin({
  type: ACTIVITY_TYPES.REMOVE,
  object: {
    type: ACTOR_TYPES.PERSON
  }
});

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

const ADD_GROUP_MEMBER = (activity: any) => ({
  match: activity.type === ACTIVITY_TYPES.ADD && !activity.origin && activity.target === activity.actor,
  dereferencedActivity: activity
});

export {
  ADD_GROUP_MEMBER,
  CONTACT_REQUEST,
  ACCEPT_CONTACT_REQUEST,
  IGNORE_CONTACT_REQUEST,
  REJECT_CONTACT_REQUEST,
  ADD_CONTACT,
  REMOVE_CONTACT,
  IGNORE_CONTACT,
  UNDO_IGNORE_CONTACT
};
