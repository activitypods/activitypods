import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema, defineAction } from 'moleculer';

const ApplicationsSchema = {
  name: 'applications' as const,
  // @ts-expect-error TS(2322): Type '{ settings: { path: null; acceptedTypes: nul... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:Application'],
    typeIndex: 'private'
  },
  actions: {
    get: defineAction({
      async handler(ctx) {
        const { appUri } = ctx.params;
        return await ctx.call('ldp.remote.get', { resourceUri: appUri });
      }
    }),

    getRequirements: defineAction({
      /**
       * Return the required access needs and special rights of the given application
       */
      async handler(ctx) {
        const { appUri } = ctx.params;

        // Force to get through network, so that we have the latest Access Need Group
        const app = await ctx.call('ldp.remote.getNetwork', { resourceUri: appUri });

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
      }
    }),

    getClassDescription: defineAction({
      async handler(ctx) {
        const { type, appUri, podOwner } = ctx.params;

        // @ts-expect-error TS(2488): Type 'never' must have a '[Symbol.iterator]()' met... Remove this comment to see the full error message
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

          // @ts-expect-error TS(18048): 'classDescriptionsUris' is possibly 'undefined'.
          for (const classDescriptionUri of classDescriptionsUris) {
            const classDescription = await ctx.call('ldp.remote.get', {
              resourceUri: classDescriptionUri,
              webId: podOwner
            });

            // @ts-expect-error TS(2488): Type 'never' must have a '[Symbol.iterator]()' met... Remove this comment to see the full error message
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
    })
  }
} satisfies ServiceSchema;

export default ApplicationsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ApplicationsSchema.name]: typeof ApplicationsSchema;
    }
  }
}
