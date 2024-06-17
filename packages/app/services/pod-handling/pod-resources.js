const { triple, namedNode } = require('@rdfjs/data-model');
const FetchPodOrProxyMixin = require('../../mixins/fetch-pod-or-proxy');
const SparqlGenerator = require('sparqljs').Generator;

module.exports = {
  name: 'pod-resources',
  mixins: [FetchPodOrProxyMixin],
  started() {
    this.sparqlGenerator = new SparqlGenerator({
      /* prefixes, baseIRI, factory, sparqlStar */
    });
  },
  actions: {
    post: {
      params: {
        containerUri: { type: 'string', optional: false },
        resource: { type: 'object', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx) {
        const { containerUri, resource, actorUri } = ctx.params;

        // Adds the default context, if it is missing
        if (!resource['@context']) {
          resource = {
            '@context': await ctx.call('jsonld.context.get'),
            ...resource
          };
        }

        const { headers } = await this.actions.fetch({
          url: containerUri,
          method: 'POST',
          headers: {
            'Content-Type': 'application/ld+json'
          },
          body: JSON.stringify(resource),
          actorUri
        });

        return headers.get('Location');
      }
    },
    list: {
      params: {
        containerUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx) {
        const { containerUri, actorUri } = ctx.params;

        const { body } = await this.actions.fetch({
          url: containerUri,
          method: 'GET',
          headers: {
            Accept: 'application/ld+json',
            JsonLdContext: JSON.stringify(await ctx.call('jsonld.context.get'))
          },
          actorUri
        });

        return body;
      }
    },
    get: {
      params: {
        resourceUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx) {
        const { resourceUri, actorUri } = ctx.params;

        const { body } = await this.actions.fetch({
          url: resourceUri,
          method: 'GET',
          headers: {
            Accept: 'application/ld+json',
            JsonLdContext: JSON.stringify(await ctx.call('jsonld.context.get'))
          },
          actorUri
        });

        return body;
      }
    },
    patch: {
      params: {
        resourceUri: { type: 'string', optional: false },
        triplesToAdd: { type: 'array', optional: true },
        triplesToRemove: { type: 'array', optional: true },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx) {
        const { resourceUri, triplesToAdd, triplesToRemove, actorUri } = ctx.params;

        let sparqlUpdate = {
          type: 'update',
          updates: []
        };

        if (triplesToAdd) {
          sparqlUpdate.updates.push({
            updateType: 'insert',
            insert: [{ type: 'bgp', triples: triplesToAdd }]
          });
        }

        if (triplesToRemove) {
          sparqlUpdate.updates.push({
            updateType: 'delete',
            delete: [{ type: 'bgp', triples: triplesToRemove }]
          });
        }

        await this.actions.fetch({
          url: resourceUri,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/sparql-update'
          },
          body: this.sparqlGenerator.stringify(sparqlUpdate),
          actorUri
        });
      }
    },
    put: {
      params: {
        resource: { type: 'object', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx) {
        let { resource, actorUri } = ctx.params;

        // Adds the default context, if it is missing
        if (!resource['@context']) {
          resource = {
            '@context': await ctx.call('jsonld.context.get'),
            ...resource
          };
        }

        await this.actions.fetch({
          url: resource.id || resource['@id'],
          method: 'PUT',
          headers: {
            'Content-Type': 'application/ld+json'
          },
          body: JSON.stringify(resource),
          actorUri
        });
      }
    },
    delete: {
      params: {
        resourceUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx) {
        const { resourceUri, actorUri } = ctx.params;

        await this.actions.fetch({
          url: resourceUri,
          method: 'DELETE',
          actorUri
        });
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
