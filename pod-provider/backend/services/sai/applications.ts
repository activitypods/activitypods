import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema } from 'moleculer';

const ApplicationsSchema = {
  name: 'applications' as const,
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:Application'],
    typeIndex: 'private'
  },
  actions: {
    get: {
      async handler(ctx) {
        const { appUri } = ctx.params;
        return await ctx.call('ldp.remote.get', { resourceUri: appUri });
      }
    },

    getAccessNeedGroups: {
      async handler(ctx) {
        const { appUri } = ctx.params;

        // Force to get through network, so that we have the latest Access Need Group
        const app = await ctx.call('ldp.remote.getNetwork', { resourceUri: appUri });

        const accessNeedGroups = [];
        for (const accessNeedGroupUri of arrayOf(app['interop:hasAccessNeedGroup'])) {
          accessNeedGroups.push(
            await ctx.call('ldp.resource.get', { resourceUri: accessNeedGroupUri, accept: MIME_TYPES.JSON })
          );
        }
        return accessNeedGroups;
      }
    },

    getRequirements: {
      /**
       * Return the required access needs and special rights of the given application
       * Pass accessNeedGroups to only consider some of them
       */
      async handler(ctx) {
        const { appUri } = ctx.params;
        const accessNeedGroups =
          ctx.params.accessNeedGroups || (await this.actions.getAccessNeedGroups({ appUri }, { parentCtx: ctx }));

        let accessNeeds = [],
          specialRights = [];
        for (const accessNeedGroup of accessNeedGroups) {
          if (accessNeedGroup['interop:accessNecessity'] === 'interop:AccessRequired') {
            accessNeeds.push(...arrayOf(accessNeedGroup['interop:hasAccessNeed']));
            specialRights.push(...arrayOf(accessNeedGroup['apods:hasSpecialRights']));
          }
        }

        return { accessNeeds, specialRights };
      }
    },

    getClassDescription: {
      async handler(ctx) {
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

          // @ts-expect-error TS(18048): 'classDescriptionsUris' is possibly 'undefined'.
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
