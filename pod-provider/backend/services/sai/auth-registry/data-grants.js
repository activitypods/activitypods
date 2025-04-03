const { ControlledContainerMixin } = require('@semapps/ldp');
const ImmutableContainerMixin = require('../../../mixins/immutable-container-mixin');

module.exports = {
  name: 'data-grants',
  mixins: [ControlledContainerMixin, ImmutableContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataGrant'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  dependencies: ['ldp', 'ldp.registry'],
  actions: {
    // Get the DataGrant linked with an AccessNeed
    async getByAccessNeed(ctx) {
      const { accessNeedUri, podOwner } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': accessNeedUri,
            'http://www.w3.org/ns/solid/interop#dataOwner': podOwner
          },
          webId: podOwner
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    },
    async getByDataAuthorization(ctx) {
      const { dataAuthorizationUri, podOwner } = ctx.params;

      const dataAuthorization = await ctx.call('data-authorizations.get', {
        resourceUri: dataAuthorizationUri,
        webId: podOwner
      });

      return await this.actions.getByAccessNeed(
        { accessNeedUri: dataAuthorization['interop:satisfiesAccessNeed'], podOwner },
        { parentCtx: ctx }
      );
    }
  }
};
