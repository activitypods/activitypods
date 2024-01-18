const { ControlledContainerMixin, defaultToArray } = require('@semapps/ldp');
const { OBJECT_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { NEW_MESSAGE } = require('../config/patterns');
const { NEW_MESSAGE_MAPPING } = require('../config/mappings');

module.exports = {
  name: 'messages.message',
  mixins: [ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    acceptedTypes: 'as:Note',
    permissions: {},
    newResourcesPermissions: {}
  },
  dependencies: ['activity-mapping'],
  async started() {
    await this.broker.call('activity-mapping.addMapper', {
      match: NEW_MESSAGE,
      mapping: NEW_MESSAGE_MAPPING
    });
  },
  activities: {
    createNote: {
      match: NEW_MESSAGE,
      async onEmit(ctx, activity, emitterUri) {
        // Ensure the recipients are in the contacts WebACL group of the emitter so they can see his profile (and respond him)
        for (let targetUri of defaultToArray(activity.to)) {
          await ctx.call('webacl.group.addMember', {
            groupSlug: new URL(emitterUri).pathname + '/contacts',
            memberUri: targetUri,
            webId: emitterUri
          });
        }
      }
    }
  }
};
