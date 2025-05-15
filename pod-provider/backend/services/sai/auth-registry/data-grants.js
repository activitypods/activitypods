const { ControlledContainerMixin, getId } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const ImmutableContainerMixin = require('../../../mixins/immutable-container-mixin');
const DataGrantsMixin = require('../../../mixins/data-grants');

module.exports = {
  name: 'data-grants',
  mixins: [ImmutableContainerMixin, ControlledContainerMixin, DataGrantsMixin],
  settings: {
    acceptedTypes: ['interop:DataGrant'],
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  dependencies: ['ldp', 'ldp.registry'],
  actions: {
    async generateFromDataAuthorization(ctx) {
      const { dataAuthorization } = ctx.params;

      // Data authorizations with scope interop:All map to data grants with scope interop:AllFromRegistry
      const scopeOfGrant =
        dataAuthorization['interop:scopeOfAuthorization'] === 'interop:All'
          ? 'interop:AllFromRegistry'
          : dataAuthorization['interop:scopeOfAuthorization'];

      const dataGrantUri = await this.actions.post(
        {
          resource: {
            ...dataAuthorization,
            id: undefined,
            type: 'interop:DataGrant',
            'interop:grantedBy': dataAuthorization['interop:dataOwner'],
            'interop:scopeOfGrant': scopeOfGrant,
            'interop:scopeOfAuthorization': undefined
          },
          contentType: MIME_TYPES.JSON,
          webId: dataAuthorization['interop:dataOwner']
        },
        { parentCtx: ctx }
      );

      return dataGrantUri;
    },
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
      const { dataAuthorization } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': dataAuthorization['interop:satisfiesAccessNeed'],
            'http://www.w3.org/ns/solid/interop#dataOwner': dataAuthorization['interop:dataOwner'],
            'http://www.w3.org/ns/solid/interop#grantee': dataAuthorization['interop:grantee'],
            'http://www.w3.org/ns/solid/interop#hasDataRegistration': dataAuthorization['interop:hasDataRegistration']
          },
          webId: dataAuthorization['interop:dataOwner']
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    },
    async getByResourceUri(ctx) {
      const { resourceUri, webId } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#hasDataInstance': resourceUri
          },
          webId
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    }
  }
};
