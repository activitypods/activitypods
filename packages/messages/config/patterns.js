const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');

const NEW_MESSAGE = {
  type: ACTIVITY_TYPES.CREATE,
  object: {
    type: OBJECT_TYPES.NOTE
  }
};

module.exports = {
  NEW_MESSAGE
};
