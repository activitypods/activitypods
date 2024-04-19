const urlJoin = require('url-join');
const { triple, namedNode } = require('@rdfjs/data-model');
const SparqlGenerator = require('sparqljs').Generator;
const FetchPodOrProxyMixin = require('../../mixins/fetch-pod-or-proxy');
const { arrayOf } = require('@semapps/ldp');

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
      const { resourceUri, attachPredicate, collectionOptions, actorUri } = ctx.params;
      const { ordered, summary, itemsPerPage, dereferenceItems, sortPredicate, sortOrder } = collectionOptions;

      const { status, headers } = await this.actions.fetch({
        method: 'POST',
        url: urlJoin(actorUri, '/data/as/collection'), // TODO use TypeIndex to find container URL
        headers: {
          'Content-Type': 'application/ld+json'
        },
        body: JSON.stringify({
          '@context': await ctx.call('jsonld.context.get'),
          type: ordered ? 'OrderedCollection' : 'Collection',
          summary,
          'semapps:itemsPerPage': itemsPerPage,
          'semapps:dereferenceItems': dereferenceItems,
          'semapps:sortPredicate': ordered ? sortPredicate : undefined,
          'semapps:sortOrder': ordered ? sortOrder : undefined
        }),
        actorUri
      });

      if (status === 201) {
        const collectionUri = headers.location;

        const expandedAttachPredicate = await ctx.call('jsonld.parser.expandPredicate', { predicate: attachPredicate });

        await ctx.call('pod-resources.patch', {
          resourceUri,
          triplesToAdd: [triple(namedNode(resourceUri), namedNode(expandedAttachPredicate), namedNode(collectionUri))],
          actorUri
        });

        return collectionUri;
      }
    },
    async deleteAndDetach(ctx) {
      const { resourceUri, attachPredicate, actorUri } = ctx.params;

      const resource = await ctx.call('pod-resources.get', {
        resourceUri,
        actorUri
      });

      const expandedAttachPredicate = await ctx.call('jsonld.parser.expandPredicate', { predicate: attachPredicate });

      const collectionUri = await this.actions.getCollectionUriFromResource({
        resource,
        attachPredicate: expandedAttachPredicate
      });
      if (!collectionUri) throw new Error(`No collection with predicate ${attachPredicate} attached to ${resourceUri}`);

      await ctx.call('pod-resources.delete', {
        resourceUri: collectionUri,
        actorUri
      });

      await ctx.call('pod-resources.patch', {
        resourceUri,
        triplesToRemove: [triple(namedNode(resourceUri), namedNode(expandedAttachPredicate), namedNode(collectionUri))],
        actorUri
      });
    },
    async add(ctx) {
      const { collectionUri, itemUri, actorUri } = ctx.params;

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
    async remove(ctx) {
      const { collectionUri, itemUri, actorUri } = ctx.params;

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
    },
    async createAndAttachMissing(ctx) {
      const { type, attachPredicate, collectionOptions } = ctx.params;

      const expandedAttachPredicate = await ctx.call('jsonld.parser.expandPredicate', { predicate: attachPredicate });

      // Go through all pods
      for (let podOwner of await ctx.call('app-registrations.getRegisteredPods')) {
        this.logger.info(`Going through resources of ${podOwner}...`);
        // Find the container for this type
        const containerUri = await ctx.call('data-grants.getContainerByType', { type, podOwner });
        if (!containerUri) throw new Error(`No container found with type ${type} on pod ${podOwner}`);

        const container = await ctx.call('pod-resources.list', { containerUri, actorUri: podOwner });

        // Go through all resources in the container
        for (let resource of arrayOf(container['ldp:contains'])) {
          resource = { '@context': container['@context'], ...resource };
          const resourceUri = resource.id || resource['@id'];
          const collectionUri = await this.actions.getCollectionUriFromResource(
            { resource, attachPredicate: expandedAttachPredicate },
            { parentCtx: ctx }
          );

          if (!collectionUri) {
            this.logger.info(`Attaching collection to ${resourceUri}...`);
            await this.actions.createAndAttach(
              { resourceUri, attachPredicate: expandedAttachPredicate, collectionOptions, actorUri: podOwner },
              { parentCtx: ctx }
            );
          } else {
            this.logger.info(`A collection ${collectionUri} is already attached to ${resourceUri}. Skipping...`);
          }
        }
      }
    },
    // Find the collection attached to a given resource (or undefined if no collection is attached)
    async getCollectionUriFromResource(ctx) {
      const { resource, attachPredicate } = ctx.params;
      const expandedAttachPredicate = await ctx.call('jsonld.parser.expandPredicate', { predicate: attachPredicate });
      const [expandedResource] = await ctx.call('jsonld.parser.expand', { input: resource });
      return expandedResource[expandedAttachPredicate]?.[0]?.['@id'];
    }
  }
};
