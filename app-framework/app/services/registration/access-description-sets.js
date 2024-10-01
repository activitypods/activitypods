const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { arraysEqual } = require('../../utils');

module.exports = {
  name: 'access-description-sets',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessDescriptionSet'],
    readOnly: true,
    excludeFromMirror: true,
    activateTombstones: false
  },
  actions: {
    put() {
      throw new Error(`The resources of type interop:AccessDescriptionSet are immutable`);
    },
    patch() {
      throw new Error(`The resources of type interop:AccessDescriptionSet are immutable`);
    },
    async createOrUpdate(ctx) {
      const { classDescriptions, appUri } = ctx.params;
      const app = await ctx.call('ldp.resource.get', { resourceUri: appUri, accept: MIME_TYPES.JSON });
      let classDescriptionsByLocale = {};

      /*
       * Create all the class descriptions
       * If the class description has not changed, we simply get its URI
       * If the class description changed, we recreate it as it must be immutable
       */
      for (const [type, classDescription] of Object.entries(classDescriptions)) {
        const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });
        const [expandedLabelPredicate] = classDescription.labelPredicate
          ? await ctx.call('jsonld.parser.expandTypes', {
              types: [classDescription.labelPredicate]
            })
          : [undefined];

        for (const locale of Object.keys(classDescription.label)) {
          const existingClassDescriptionUri = await ctx.call('class-descriptions.findExisting', {
            locale,
            type: expandedType,
            label: classDescription.label[locale],
            labelPredicate: expandedLabelPredicate,
            openEndpoint: classDescription.openEndpoint,
            icon: classDescription.icon || app['oidc:logo_uri']
          });

          if (existingClassDescriptionUri) {
            if (!classDescriptionsByLocale[locale]) classDescriptionsByLocale[locale] = [];
            classDescriptionsByLocale[locale].push(existingClassDescriptionUri);
          } else {
            const classDescriptionUri = await ctx.call('class-descriptions.post', {
              resource: {
                type: 'apods:ClassDescription',
                'apods:describedClass': expandedType,
                'apods:describedBy': appUri,
                'skos:prefLabel': classDescription.label[locale],
                'apods:labelPredicate': expandedLabelPredicate,
                'apods:openEndpoint': classDescription.openEndpoint,
                'apods:icon': classDescription.icon || app['oidc:logo_uri']
              },
              contentType: MIME_TYPES.JSON,
              webId: 'system'
            });
            if (!classDescriptionsByLocale[locale]) classDescriptionsByLocale[locale] = [];
            classDescriptionsByLocale[locale].push(classDescriptionUri);
          }
        }
      }

      /**
       * Now we have created all the class descriptions, put them in the corresponding access description sets
       */

      const existingSetsByLocale = await this.actions.findExistingByLocale({}, { parentCtx: ctx });

      for (const [locale, classDescriptionUris] of Object.entries(classDescriptionsByLocale)) {
        const existingSet = existingSetsByLocale[locale];

        if (existingSet) {
          if (arraysEqual(existingSet['apods:hasClassDescription'], classDescriptionUris)) {
            continue;
          } else {
            this.logger.info(`Deleting access description set ${existingSet.id} as it must be recreated.`);
            await this.actions.delete({ resourceUri: existingSet.id, webId: 'system' });

            const classDescriptionsToDelete = arrayOf(existingSet['apods:hasClassDescription']).filter(
              uri => !classDescriptionUris.includes(uri)
            );
            for (const uri of classDescriptionsToDelete) {
              this.logger.info(`Deleting class description ${uri} as it has been modified or removed.`);
              await ctx.call('class-descriptions.delete', { resourceUri: uri, webId: 'system' });
            }
          }
        }

        const setUri = await this.actions.post(
          {
            resource: {
              type: 'interop:AccessDescriptionSet',
              'interop:usesLanguage': locale,
              'apods:hasClassDescription': classDescriptionUris
            },
            contentType: MIME_TYPES.JSON,
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        this.logger.info(`Created new access description set ${setUri}`);
      }

      /*
       * Delete orphan access descriptions sets
       */

      for (const [locale, existingSet] of Object.entries(existingSetsByLocale)) {
        if (!classDescriptionsByLocale[locale]) {
          this.logger.info(`Deleting access description set ${existingSet.id} as locale has been removed.`);
          await this.actions.delete({ resourceUri: existingSet.id, webId: 'system' });

          for (const uri of arrayOf(existingSet['apods:hasClassDescription'])) {
            this.logger.info(`Deleting class description ${uri} as locale has been removed.`);
            await ctx.call('class-descriptions.delete', { resourceUri: uri, webId: 'system' });
          }
        }
      }
    },
    async findExistingByLocale(ctx) {
      const descriptionSets = await this.actions.list({}, { parentCtx: ctx });
      return Object.fromEntries(descriptionSets['ldp:contains']?.map(set => [set['interop:usesLanguage'], set]) ?? []);
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        await ctx.call('actors.attachAccessDescriptionSet', { accessDescriptionSetUri: res });
        return res;
      },
      async delete(ctx, res) {
        await ctx.call('actors.detachAccessDescriptionSet', { accessDescriptionSetUri: ctx.params.resourceUri });
        return res;
      }
    }
  }
};
