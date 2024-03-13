const { ControlledContainerMixin, getDatasetFromUri } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { skos } = require('@semapps/ontologies');

module.exports = {
  name: 'class-description',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['apods:ClassDescription'],
    readOnly: true,
    excludeFromMirror: true
  },
  async started() {
    await this.broker.call('ontologies.register', {
      ...skos,
      overwrite: true
    });
  },
  actions: {
    async register(ctx) {
      const { type, appUri, label, labelPredicate, openEndpoint, webId } = ctx.params;

      const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });
      await this.actions.waitForContainerCreation({ containerUri }, { parentCtx: ctx });

      const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

      let returnValue = {};

      for (const locale of Object.keys(label)) {
        let classDescriptionUri = await this.actions.findByLocaleAndType({ locale, type: expandedType, webId });

        if (classDescriptionUri) {
          const classDescription = await this.actions.get({
            resourceUri: classDescriptionUri,
            accept: MIME_TYPES.JSON,
            webId
          });

          // If ClassDescription exist, update it
          await this.actions.put(
            {
              resource: {
                ...classDescription,
                'skos:prefLabel': label[locale],
                'apods:labelPredicate': labelPredicate,
                'apods:openEndpoint': openEndpoint
              },
              contentType: MIME_TYPES.JSON,
              webId
            },
            {
              parentCtx: ctx
            }
          );
        } else {
          // If ClassDescription doesn't exist, create it
          classDescriptionUri = await this.actions.post(
            {
              resource: {
                type: 'apods:ClassDescription',
                'apods:describedClass': expandedType,
                'apods:describedBy': appUri,
                'skos:prefLabel': label[locale],
                'apods:labelPredicate': labelPredicate,
                'apods:openEndpoint': openEndpoint
              },
              contentType: MIME_TYPES.JSON,
              webId
            },
            {
              parentCtx: ctx
            }
          );
        }

        returnValue[locale] = classDescriptionUri;
      }

      return returnValue;
    },
    async findByLocaleAndType(ctx) {
      const { locale, type, webId } = ctx.params;
      const results = await ctx.call('triplestore.query', {
        query: `
          PREFIX apods: <http://activitypods.org/ns/core#>
          PREFIX interop: <http://www.w3.org/ns/solid/interop#>
          SELECT ?classDescription 
          WHERE {
            ?classDescription apods:describedClass <${type}> .
            ?classDescription a apods:ClassDescription .
            ?set apods:hasClassDescription ?classDescription .
            ?set interop:usesLanguage "${locale}"^^<http://www.w3.org/2001/XMLSchema#language>
          }
        `,
        dataset: webId !== 'system' ? getDatasetFromUri(webId) : undefined,
        accept: MIME_TYPES.JSON,
        webId
      });

      return results[0]?.classDescription.value;
    }
  }
};
