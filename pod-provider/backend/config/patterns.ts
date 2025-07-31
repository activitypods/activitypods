// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { ACTIVITY_TYPES, OBJECT_TYPES } from '@semapps/activitypub';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
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

export default {
  CONTACT_REQUEST,
  ACCEPT_CONTACT_REQUEST,
  IGNORE_CONTACT_REQUEST,
  REJECT_CONTACT_REQUEST,
  ADD_CONTACT,
  REMOVE_CONTACT,
  IGNORE_CONTACT,
  UNDO_IGNORE_CONTACT
};
