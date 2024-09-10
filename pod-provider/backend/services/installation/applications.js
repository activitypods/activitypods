const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'applications',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:Application'],
    description: {
      labelMap: {
        en: 'Applications'
      },
      labelPredicate: 'interop:applicationName',
      internal: true
    }
  },
  actions: {
    async get(ctx) {
      const { appUri } = ctx.params;
      return await ctx.call('ldp.remote.get', { resourceUri: appUri });
    },
    async getClassDescription(ctx) {
      const { type, appUri, podOwner } = ctx.params;

      const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

      const app = await this.actions.get({ appUri }, { parentCtx: ctx });

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
            context: classDescription['@context']
          });

          if (expandedType === appExpandedType) {
            return classDescription;
          }
        }
      }
    }
  }
};
