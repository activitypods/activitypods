const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'applications',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:Application'],
    private: true
  },
  actions: {
    async get(ctx) {
      const { appUri } = ctx.params;
      return await ctx.call('ldp.remote.get', { resourceUri: appUri });
    },
    /**
     * Return the required access needs and special rights of the given application
     */
    async getRequirements(ctx) {
      const { appUri } = ctx.params;
      const app = await ctx.call('ldp.resource.get', { resourceUri: appUri, accept: MIME_TYPES.JSON });

      let accessNeeds = [],
        specialRights = [];
      for (const accessNeedGroupUri of arrayOf(app['interop:hasAccessNeedGroup'])) {
        const accessNeedGroup = await ctx.call('ldp.resource.get', {
          resourceUri: accessNeedGroupUri,
          accept: MIME_TYPES.JSON
        });
        if (accessNeedGroup['interop:accessNecessity'] === 'interop:AccessRequired') {
          accessNeeds.push(...arrayOf(accessNeedGroup['interop:hasAccessNeed']));
          specialRights.push(...arrayOf(accessNeedGroup['apods:hasSpecialRights']));
        }
      }

      return { accessNeeds, specialRights };
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
