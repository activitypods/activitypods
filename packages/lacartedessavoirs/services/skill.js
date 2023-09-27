const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'lacartedessavoirs.skill',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/skills',
    acceptedTypes: ['pair:Skill'],
    permissions: {},
    newResourcesPermissions: {},
  },
  actions: {
    // Give read right on /skills container and all its resources
    async giveReadRightsToContacts(ctx) {
      const { webId } = ctx.params;

      const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });

      await this.actions.waitForContainerCreation({ containerUri }, { parentCtx: ctx });

      const contactsGroupUri = await ctx.call('webacl.group.getUri', {
        groupSlug: new URL(webId).pathname + '/contacts',
      });

      await ctx.call('webacl.resource.addRights', {
        resourceUri: containerUri,
        additionalRights: {
          group: {
            uri: contactsGroupUri,
            read: true,
          },
          default: {
            group: {
              uri: contactsGroupUri,
              read: true,
            },
          },
        },
        webId,
      });
    },
  },
  events: {
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;
      await this.actions.giveReadRightsToContacts({ webId }, { parentCtx: ctx });
    },
  },
};
