const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');

module.exports = {
  name: 'access-grants',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessGrant'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true,
    activateTombstones: false,
    private: true
  },
  actions: {
    put() {
      throw new Error(`The resources of type interop:AccessGrant are immutable`);
    },
    patch() {
      throw new Error(`The resources of type interop:AccessGrant are immutable`);
    },
    // Get all the AccessGrants granted to an application
    async getForApp(ctx) {
      const { appUri, podOwner } = ctx.params;

      const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });

      const filteredContainer = await this.actions.list(
        {
          containerUri,
          filters: {
            'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
            'http://www.w3.org/ns/solid/interop#grantee': appUri
          },
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains']);
    },
    // Get the AccessGrant linked with an AccessNeedGroup
    async getByAccessNeedGroup(ctx) {
      const { accessNeedGroupUri, podOwner } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
            'http://www.w3.org/ns/solid/interop#hasAccessNeedGroup': accessNeedGroupUri
          },
          webId: podOwner
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    }
  }
};
