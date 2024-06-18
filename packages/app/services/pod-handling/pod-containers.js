const SparqlGenerator = require('sparqljs').Generator;
const { triple, namedNode } = require('@rdfjs/data-model');
const { arrayOf } = require('@semapps/ldp');
const FetchPodOrProxyMixin = require('../../mixins/fetch-pod-or-proxy');

module.exports = {
  name: 'pod-containers',
  mixins: [FetchPodOrProxyMixin],
  started() {
    this.sparqlGenerator = new SparqlGenerator({
      /* prefixes, baseIRI, factory, sparqlStar */
    });
  },
  actions: {
    /**
     * Fetch the TypeIndex and return the first containerUri that holds resources of the given type
     * TODO Use some cache mechanism, or fetch all type registration at the app start
     */
    getByType: {
      params: {
        type: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx) {
        const { type } = ctx.params;

        const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

        const { body: actor } = await this.actions.fetch({
          url: actorUri,
          headers: {
            'Content-Type': 'application/ld+json'
          },
          actorUri
        });

        if (actor['solid:publicTypeIndex']) {
          const { body: typeIndex } = await this.actions.fetch({
            url: actor['solid:publicTypeIndex'],
            headers: {
              'Content-Type': 'application/ld+json'
            },
            actorUri
          });

          // Go through all TypeRegistration
          for (const registrationUri of arrayOf(typeIndex['solid:hasTypeRegistration'])) {
            const { body: registration } = await this.actions.fetch({
              url: registrationUri,
              headers: {
                'Content-Type': 'application/ld+json'
              },
              actorUri
            });

            const expandedRegisteredTypes = await ctx.call('jsonld.parser.expandTypes', {
              types: registration['solid:forClass']
            });

            if (expandedRegisteredTypes.includes(expandedType)) {
              return registration['solid:instanceContainer'];
            }
          }

          throw new Error(`No container found for type ${expandedType} in the TypeIndex of ${actorUri}`);
        }
      }
    },
    attach: {
      params: {
        containerUri: { type: 'string', optional: false },
        resourceUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx) {
        const { containerUri, resourceUri, actorUri } = ctx.params;

        const sparqlUpdate = {
          type: 'update',
          updates: [
            {
              updateType: 'insert',
              insert: [
                {
                  type: 'bgp',
                  triples: [
                    triple(
                      namedNode(containerUri),
                      namedNode('http://www.w3.org/ns/ldp#contains'),
                      namedNode(resourceUri)
                    )
                  ]
                }
              ]
            }
          ]
        };

        await this.actions.fetch({
          url: containerUri,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/sparql-update'
          },
          body: this.sparqlGenerator.stringify(sparqlUpdate),
          actorUri
        });
      }
    },
    detach: {
      params: {
        containerUri: { type: 'string', optional: false },
        resourceUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx) {
        const { containerUri, resourceUri, actorUri } = ctx.params;

        const sparqlUpdate = {
          type: 'update',
          updates: [
            {
              updateType: 'delete',
              insert: [
                {
                  type: 'bgp',
                  triples: [
                    triple(
                      namedNode(containerUri),
                      namedNode('http://www.w3.org/ns/ldp#contains'),
                      namedNode(resourceUri)
                    )
                  ]
                }
              ]
            }
          ]
        };

        await this.actions.fetch({
          url: containerUri,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/sparql-update'
          },
          body: this.sparqlGenerator.stringify(sparqlUpdate),
          actorUri
        });
      }
    }
  }
};
