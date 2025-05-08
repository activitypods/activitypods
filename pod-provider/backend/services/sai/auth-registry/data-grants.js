const { ControlledContainerMixin, getId } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { ACTIVITY_TYPES, ActivitiesHandlerMixin, matchActivity } = require('@semapps/activitypub');
const ImmutableContainerMixin = require('../../../mixins/immutable-container-mixin');

module.exports = {
  name: 'data-grants',
  mixins: [ImmutableContainerMixin, ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    acceptedTypes: ['interop:DataGrant'],
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
  },
  hooks: {
    after: {
      async create(ctx, res) {
        const dataGrant = res.newData;

        await ctx.call('webacl.resource.addRights', {
          resourceUri: getId(dataGrant),
          additionalRights: {
            user: {
              uri: dataGrant['interop:grantee'],
              read: true
            }
          },
          webId: 'system'
        });

        const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
          actorUri: dataGrant['interop:dataOwner'],
          predicate: 'outbox'
        });

        await ctx.call(
          'activitypub.outbox.post',
          {
            collectionUri: outboxUri,
            type: ACTIVITY_TYPES.CREATE,
            object: getId(dataGrant),
            to: dataGrant['interop:grantee']
          },
          { meta: { webId: dataGrant['interop:grantedBy'] } }
        );

        return res;
      }
    }
  },
  activities: {
    createDataGrant: {
      // Match data grants and delegated data grants
      async match(activity, fetcher) {
        const { match, dereferencedActivity } = await matchActivity(
          {
            type: ACTIVITY_TYPES.CREATE,
            object: {
              type: 'interop:DataGrant'
            }
          },
          activity,
          fetcher
        );
        if (match) {
          return { match, dereferencedActivity };
        } else {
          return await matchActivity(
            {
              type: ACTIVITY_TYPES.CREATE,
              object: {
                type: 'interop:DelegatedDataGrant'
              }
            },
            activity,
            fetcher
          );
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        const dataGrant = activity.object;

        // Delete from cache the old data grant
        if (dataGrant['interop:replaces']) {
          try {
            await ctx.call('ldp.remote.delete', {
              resourceUri: dataGrant['interop:replaces'],
              webId: recipientUri
            });
          } catch (e) {
            this.logger.warn(
              `Could not delete data grant ${dataGrant['interop:replaces']} on storage of ${recipientUri}. Ignoring...`
            );
          }
        }

        // Generate delegated data grants for all data authorizations with `interop:All` scope
        const grantees = await ctx.call('delegated-data-grants.generateFromAllScopeAllDataAuthorizations', {
          dataGrant,
          podOwner: recipientUri
        });

        // Regenerate the app registrations if needed
        // TODO Also regenerate the social agent registrations
        for (const grantee of grantees) {
          await ctx.call('app-registrations.regenerate', {
            appUri: grantee,
            podOwner: recipientUri
          });
        }
      }
    }
  }
};
