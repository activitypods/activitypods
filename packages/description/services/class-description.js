const { triple, namedNode } = require('@rdfjs/data-model');
const { ControlledContainerMixin, getDatasetFromUri } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'class-description',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['apods:ClassDescription'],
    readOnly: true
  },
  actions: {
    async register(ctx) {
      const { type, appUri, label, labelPredicate, openEndpoint, webId } = ctx.params;

      const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

      // let userLocal;

      // if (podOwner) {
      //   // Wait to know the user language
      //   const userData = await ctx.call('ldp.resource.awaitCreateComplete', {
      //     resourceUri: podOwner,
      //     predicates: ['schema:knowsLanguage']
      //   });

      //   userLocal = userData['schema:knowsLanguage'];
      // }

      for (const locale of Object.keys(label)) {
        let classDescriptionUri = await this.actions.findByLocaleAndType({ locale, type: expandedType, webId });

        if (classDescriptionUri) {
          // If ClassDescription exist, update it
          await this.actions.put(
            {
              resource: {
                '@id': classDescriptionUri,
                '@type': 'apods:ClassDescription',
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
                '@type': 'apods:ClassDescription',
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

        const descriptionSet = await ctx.call('access-description-set.findByLocale', { locale, webId });
        if (descriptionSet) {
          await ctx.call('access-description-set.patch', {
            resourceUri: descriptionSet.id,
            triplesToAdd: [
              triple(
                namedNode(descriptionSet.id),
                namedNode('http://activitypods.org/ns/core#hasClassDescription'),
                namedNode(classDescriptionUri)
              )
            ],
            webId
          });
        } else {
          await ctx.call('access-description-set.post', {
            resource: {
              type: 'interop:AccessDescriptionSet',
              'interop:usesLanguage': locale,
              'apods:hasClassDescription': classDescriptionUri
            },
            contentType: MIME_TYPES.JSON,
            webId
          });
        }
      }
    },
    async findByLocaleAndType(ctx) {
      const { locale, type, webId } = ctx.params;
      const results = await ctx.call('triplestore.query', {
        query: `
          PREFIX apods: <http://activitypods.org/ns/core#>
          PREFIX interop: <http://www.w3.org/ns/solid/interop#>
          SELECT ?classDescription 
          WHERE {
            ?classDescription apods:describedClass "${type}"
            ?classDescription a apods:ClassDescription .
            ?set apods:hasClassDescription ?classDescription .
            ?set interop:usesLanguage "${locale}"
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
