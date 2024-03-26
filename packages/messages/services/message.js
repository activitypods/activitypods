const { ControlledContainerMixin, defaultToArray } = require('@semapps/ldp');
const { OBJECT_TYPES, ActivitiesHandlerMixin, matchActivity } = require('@semapps/activitypub');
const { NEW_MESSAGE } = require('../config/patterns');
const { NEW_MESSAGE_MAPPING } = require('../config/mappings');

module.exports = {
  name: 'messages.message',
  mixins: [ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    path: '/notes',
    acceptedTypes: [OBJECT_TYPES.NOTE],
    permissions: {},
    newResourcesPermissions: {}
  },
  dependencies: ['activity-mapping'],
  async started() {
    await this.broker.call('activity-mapping.addMapper', {
      match: async (ctx, activity) => {
        const dereferencedActivity = await matchActivity(ctx, NEW_MESSAGE, activity);
        // Do not send mail notification for non-private messages
        if (
          dereferencedActivity &&
          (await ctx.call('activitypub.activity.isPublic', { activity: dereferencedActivity }))
        ) {
          this.logger.warn(
            `Ignoring message ${dereferencedActivity.id || dereferencedActivity['@id']} because it is not private`
          );
          return false;
        }
        return dereferencedActivity;
      },
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
