// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema, defineAction } from 'moleculer';

const ApplicationsServiceSchema = {
  name: 'applications' as const,
  mixins: [ControlledContainerMixin],

  settings: {
    acceptedTypes: ['interop:Application'],
    typeIndex: 'private'
  },

  actions: {
    get: defineAction({
      async handler(ctx: any) {
        const { appUri } = ctx.params;
        return await ctx.call('ldp.remote.get', { resourceUri: appUri });
      }
    }),

    getRequirements: defineAction({
      /**
       * Return the required access needs and special rights of the given application
       */
      async handler(ctx: any) {
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
      // @ts-expect-error TS(7023): 'getClassDescription' implicitly has return type '... Remove this comment to see the full error message
      async handler(ctx: any) {
        const { type, appUri, podOwner } = ctx.params;

        const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

        // @ts-expect-error TS(7022): 'app' implicitly has type 'any' because it does no... Remove this comment to see the full error message
        const app = await this.actions.get({ appUri }, { parentCtx: ctx });

        if (app['interop:hasAccessDescriptionSet']) {
          const userData = await ctx.call('ldp.resource.get', {
            resourceUri: podOwner,
            accept: MIME_TYPES.JSON,
            webId: podOwner
          });

          const userLocale = userData['schema:knowsLanguage'];

          let classDescriptionsUris, defaultClassDescriptionsUris;

          // @ts-expect-error TS(7022): 'setUri' implicitly has type 'any' because it does... Remove this comment to see the full error message
          for (const setUri of arrayOf(app['interop:hasAccessDescriptionSet'])) {
            // @ts-expect-error TS(7022): 'set' implicitly has type 'any' because it does no... Remove this comment to see the full error message
            const set = await ctx.call('ldp.remote.get', { resourceUri: setUri, webId: podOwner });
            if (set['interop:usesLanguage'] === userLocale) {
              classDescriptionsUris = arrayOf(set['apods:hasClassDescription']);
            } else if (set['interop:usesLanguage'] === 'en') {
              defaultClassDescriptionsUris = arrayOf(set['apods:hasClassDescription']);
            }
          }

          if (!classDescriptionsUris) classDescriptionsUris = defaultClassDescriptionsUris;

          // @ts-expect-error TS(7022): 'classDescriptionUri' implicitly has type 'any' be... Remove this comment to see the full error message
          for (const classDescriptionUri of classDescriptionsUris) {
            // @ts-expect-error TS(7022): 'classDescription' implicitly has type 'any' becau... Remove this comment to see the full error message
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
    })
  }
} satisfies ServiceSchema;

export default ApplicationsServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ApplicationsServiceSchema.name]: typeof ApplicationsServiceSchema;
    }
  }
}
