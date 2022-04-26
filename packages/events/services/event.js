const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin } = require('@activitypods/announcer');
const { SynchronizerMixin } = require('@activitypods/synchronizer');
const { OBJECT_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'events.event',
  mixins: [SynchronizerMixin, AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/events',
    acceptedTypes: [OBJECT_TYPES.EVENT],
    permissions: {},
    newResourcesPermissions: {},
    notificationMapping: {
      title: {
        en: `{{emitterProfile.vcard:given-name}} invites you to an event "{{activity.object.name}}"`,
        fr: `{{emitterProfile.vcard:given-name}} vous invite à un événement "{{activity.object.name}}"`
      },
    }
  },
  hooks: {
    after: {
      async create(ctx, res) {
        res.newData = await ctx.call('activitypub.object.awaitCreateComplete', {
          objectUri: res.resourceUri,
          predicates: ['dc:creator', 'dc:modified', 'dc:created', 'apods:announces', 'apods:announcers', 'apods:attendees'],
        });

        await ctx.call('events.status.tagNewEvent', { eventUri: res.resourceUri });
        await ctx.call('events.registration.addCreatorToAttendees', res);
        await ctx.call('events.registration.givePermissionsForAttendeesCollection', res);
        await ctx.call('events.location.setNewRights', res);
        return res;
      },
      async patch(ctx, res) {
        await ctx.call('events.location.updateRights', res);
        if (res.newData['apods:maxAttendees'] !== res.oldData['apods:maxAttendees']) {
          await ctx.call('events.status.tagUpdatedEvent', { eventUri: res.resourceUri });
        }
        return res;
      },
      async put(ctx, res) {
        await ctx.call('events.location.updateRights', res);
        if (res.newData['apods:maxAttendees'] !== res.oldData['apods:maxAttendees']) {
          await ctx.call('events.status.tagUpdatedEvent', { eventUri: res.resourceUri });
        }
        return res;
      },
    },
  },
};
