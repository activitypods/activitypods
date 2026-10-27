import { ACTIVITY_TYPES, OBJECT_TYPES } from '@semapps/activitypub';
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

const ADD_CONTACT = {
  type: ACTIVITY_TYPES.ADD,
  object: {
    type: ACTOR_TYPES.PERSON
  },
  origin: {
    type: 'Collection'
  }
};

const REMOVE_CONTACT = {
  type: ACTIVITY_TYPES.REMOVE,
  object: {
    type: ACTOR_TYPES.PERSON
  },
  origin: {
    type: 'Collection'
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

const INVITE_TO_GROUP = (activity: any) => ({
  match: activity.type === ACTIVITY_TYPES.INVITE && activity.object === activity.actor,
  dereferencedActivity: activity
});

const ACCEPT_GROUP_INVITATION = {
  type: ACTIVITY_TYPES.ACCEPT,
  object: {
    type: ACTIVITY_TYPES.INVITE
  }
};

const REJECT_GROUP_INVITATION = {
  type: ACTIVITY_TYPES.REJECT,
  object: {
    type: ACTIVITY_TYPES.INVITE
  }
};

const UNDO_GROUP_INVITATION = {
  type: ACTIVITY_TYPES.UNDO,
  object: {
    type: ACTIVITY_TYPES.INVITE
  }
};

const REMOVE_GROUP_MEMBER = {
  type: ACTIVITY_TYPES.REMOVE,
  object: {
    type: ACTOR_TYPES.PERSON
  },
  origin: {
    type: [ACTOR_TYPES.GROUP, ACTOR_TYPES.ORGANIZATION]
  }
};

const JOIN_GROUP = {
  type: ACTIVITY_TYPES.JOIN
};

const ACCEPT_JOIN_GROUP = {
  type: ACTIVITY_TYPES.ACCEPT,
  object: {
    type: ACTIVITY_TYPES.JOIN
  }
};

const REJECT_JOIN_GROUP = {
  type: ACTIVITY_TYPES.REJECT,
  object: {
    type: ACTIVITY_TYPES.JOIN
  }
};

const UNDO_JOIN_GROUP = {
  type: ACTIVITY_TYPES.UNDO,
  object: {
    type: ACTIVITY_TYPES.JOIN
  }
};

const LEAVE_GROUP = {
  type: ACTIVITY_TYPES.LEAVE
};

const ACCEPT_LEAVE_GROUP = {
  type: ACTIVITY_TYPES.ACCEPT,
  object: {
    type: ACTIVITY_TYPES.LEAVE
  }
};

export {
  INVITE_TO_GROUP,
  ACCEPT_GROUP_INVITATION,
  REJECT_GROUP_INVITATION,
  UNDO_GROUP_INVITATION,
  REMOVE_GROUP_MEMBER,
  JOIN_GROUP,
  ACCEPT_JOIN_GROUP,
  REJECT_JOIN_GROUP,
  UNDO_JOIN_GROUP,
  LEAVE_GROUP,
  ACCEPT_LEAVE_GROUP,
  CONTACT_REQUEST,
  ACCEPT_CONTACT_REQUEST,
  IGNORE_CONTACT_REQUEST,
  REJECT_CONTACT_REQUEST,
  ADD_CONTACT,
  REMOVE_CONTACT,
  IGNORE_CONTACT,
  UNDO_IGNORE_CONTACT
};
