const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'app-registrations',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:ApplicationRegistration'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true
  },
  actions: {
    async getForApp(ctx) {
      const { appUri } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#registeredAgent': appUri
          }
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    },
    async isRegistered(ctx) {
      const { appUri, podOwner } = ctx.params;

      const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });

      const filteredContainer = await this.actions.list(
        {
          containerUri,
          filters: {
            'http://www.w3.org/ns/solid/interop#registeredAgent': appUri,
            'http://www.w3.org/ns/solid/interop#registeredBy': podOwner
          },
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains'] && filteredContainer['ldp:contains'].length > 0 ? true : false;
    },
    async getClassDescription(ctx) {
      const { type, appUri, podOwner } = ctx.params;

      const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

      const app = await ctx.call('ldp.remote.get', { resourceUri: appUri });

      if (app['interop:hasAccessDescriptionSet']) {
        const userData = await ctx.call('ldp.resource.get', {
          resourceUri: podOwner,
          accept: MIME_TYPES.JSON,
          webId: podOwner
        });

        const userLocale = userData['schema:knowsLanguage'];

        let classDescriptionsUris, defaultClassDescriptionsUris;

        for (const setUri of arrayOf(app['interop:hasAccessDescriptionSet'])) {
          const set = await ctx.call('ldp.remote.get', { resourceUri: setUri, webId: podOwner });
          if (set['interop:usesLanguage'] === userLocale) {
            classDescriptionsUris = arrayOf(set['apods:hasClassDescription']);
          } else if (set['interop:usesLanguage'] === 'en') {
            defaultClassDescriptionsUris = arrayOf(set['apods:hasClassDescription']);
          }
        }

        if (!classDescriptionsUris) classDescriptionsUris = defaultClassDescriptionsUris;

        for (const classDescriptionUri of classDescriptionsUris) {
          const classDescription = await ctx.call('ldp.remote.get', {
            resourceUri: classDescriptionUri,
            webId: podOwner
          });

          const [appExpandedType] = await ctx.call('jsonld.parser.expandTypes', {
            types: [classDescription['apods:describedClass']],
            contenxt: classDescription['@context']
          });

          if (expandedType === appExpandedType) {
            return classDescription;
          }
        }
      }
    }
  },
  hooks: {
    after: {
      async delete(ctx, res) {
        const appRegistration = res.oldData;

        // DELETE ALL RELATED GRANTS

        for (const accessGrantUri of arrayOf(appRegistration['interop:hasAccessGrant'])) {
          const accessGrant = await ctx.call('access-grants.get', {
            resourceUri: accessGrantUri,
            webId: 'system'
          });

          for (const dataGrantUri of arrayOf(accessGrant['interop:hasDataGrant'])) {
            await ctx.call('data-grants.delete', {
              resourceUri: dataGrantUri,
              webId: 'system'
            });
          }

          await ctx.call('access-grants.delete', {
            resourceUri: accessGrantUri,
            webId: 'system'
          });
        }

        return res;
      }
    }
  }
};
