const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');

const CREATE_NOTE = {
  type: ACTIVITY_TYPES.CREATE,
  object: {
    type: OBJECT_TYPES.NOTE
  }
};

module.exports = {
  CREATE_NOTE
};
