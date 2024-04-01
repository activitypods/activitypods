const urlJoin = require('url-join');
const { triple, namedNode } = require('@rdfjs/data-model');
const SparqlGenerator = require('sparqljs').Generator;
const FetchPodOrProxyMixin = require('../../mixins/fetch-pod-or-proxy');

module.exports = {
  name: 'pod-collections',
  mixins: [FetchPodOrProxyMixin],
  started() {
    this.sparqlGenerator = new SparqlGenerator({
      /* prefixes, baseIRI, factory, sparqlStar */
    });
  },
  actions: {
    async createAndAttach(ctx) {
      const { objectUri, attachPredicate, collectionOptions, actorUri } = ctx.params;
      const { ordered, summary, itemsPerPage, dereferenceItems, sortPredicate, sortOrder } = collectionOptions;

      const { status, headers } = await this.actions.fetch({
        method: 'POST',
        url: urlJoin(actorUri, '/as/collection'), // TODO use TypeIndex to find container URL
        headers: {
          'Content-Type': 'application/ld+json'
        },
        body: JSON.stringify({
          '@context': await ctx.call('jsonld.context.get'),
          type: ordered ? 'OrderedCollection' : 'Collection',
          summary,
          itemsPerPage,
          dereferenceItems,
          sortPredicate,
          sortOrder
        }),
        actorUri
      });

      if (status === 200) {
        const collectionUri = headers.get('Location');

        await ctx.call('pod-resources.patch', {
          resourceUri: objectUri,
          triplesToAdd: [triple(namedNode(objectUri), namedNode(attachPredicate), namedNode(collectionUri))],
          actorUri
        });
      }
    },
    async deleteAndDetach(ctx) {
      const { objectUri, attachPredicate, actorUri } = ctx.params;

      const object = await ctx.call('pod-resources.get', {
        resourceUri: objectUri,
        actorUri
      });

      const collectionUri = object.attachPredicate;
      if (!collectionUri) throw new Error(`No collection with predicate ${attachPredicate} attached to ${objectUri}`);

      await ctx.call('pod-resources.delete', {
        resourceUri: collectionUri,
        actorUri
      });

      await ctx.call('pod-resources.patch', {
        resourceUri: objectUri,
        triplesToRemove: [triple(namedNode(objectUri), namedNode(attachPredicate), namedNode(collectionUri))],
        actorUri
      });
    },
    async addItem(ctx) {
      const { collectionUri, itemUri } = ctx.params;

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
                    namedNode(collectionUri),
                    namedNode('https://www.w3.org/ns/activitystreams#items'),
                    namedNode(itemUri)
                  )
                ]
              }
            ]
          }
        ]
      };

      await this.actions.fetch({
        url: collectionUri,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/sparql-update'
        },
        body: this.sparqlGenerator.stringify(sparqlUpdate),
        actorUri
      });
    },
    async removeItem(ctx) {
      const { collectionUri, itemUri } = ctx.params;

      const sparqlUpdate = {
        type: 'update',
        updates: [
          {
            updateType: 'delete',
            delete: [
              {
                type: 'bgp',
                triples: [
                  triple(
                    namedNode(collectionUri),
                    namedNode('https://www.w3.org/ns/activitystreams#items'),
                    namedNode(itemUri)
                  )
                ]
              }
            ]
          }
        ]
      };

      await this.actions.fetch({
        url: collectionUri,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/sparql-update'
        },
        body: this.sparqlGenerator.stringify(sparqlUpdate),
        actorUri
      });
    }
  }
};
