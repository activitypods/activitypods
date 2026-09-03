import urlJoin from 'url-join';
import rdf from '@rdfjs/data-model';
import sparqljsModule from 'sparqljs';
const SparqlGenerator = sparqljsModule.Generator;
import FetchPodOrProxyMixin from '../../mixins/fetch-pod-or-proxy.ts';
import { arrayOf } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

const PodCollectionsSchema = {
  name: 'pod-collections' as const,
  mixins: [FetchPodOrProxyMixin],
  started() {
    this.sparqlGenerator = new SparqlGenerator({
      /* prefixes, baseIRI, factory, sparqlStar */
    });
  },
  actions: {
    getItems: {
      async handler(ctx) {
        const { collectionUri, actorUri } = ctx.params;

        const { body: collection } = await ctx.call('pod-resources.get', { resourceUri: collectionUri, actorUri });

        return arrayOf(collection?.items || collection?.orderedItems);
      }
    },

    createAndAttach: {
      async handler(ctx) {
        const { resourceUri, attachPredicate, collectionOptions, actorUri } = ctx.params;
        const { ordered, summary, itemsPerPage, dereferenceItems, sortPredicate, sortOrder } = collectionOptions;

        const expandedAttachPredicate = await ctx.call('jsonld.parser.expandPredicate', { predicate: attachPredicate });

        const { body: resource } = await ctx.call('pod-resources.get', { resourceUri, actorUri });
        const [expandedResource] = await ctx.call('jsonld.parser.expand', { input: resource });

        // Ensure no similar collection is already attached to the resource
        // (May happen if another app is already attaching the same kind of collections)
        if (!expandedResource[expandedAttachPredicate]) {
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

            await ctx.call('pod-resources.patch', {
              resourceUri,
              triplesToAdd: [
                rdf.quad(
                  rdf.namedNode(resourceUri),
                  rdf.namedNode(expandedAttachPredicate),
                  rdf.namedNode(collectionUri)
                )
              ],
              actorUri
            });

            return collectionUri;
          }
        }
      }
    },

    deleteAndDetach: {
      async handler(ctx) {
        const { resourceUri, attachPredicate, actorUri } = ctx.params;

        const { ok, body: resource } = await ctx.call('pod-resources.get', {
          resourceUri,
          actorUri
        });

        if (ok) {
          const expandedAttachPredicate = await ctx.call('jsonld.parser.expandPredicate', {
            predicate: attachPredicate
          });

          const collectionUri = await this.actions.getCollectionUriFromResource({
            resource,
            attachPredicate: expandedAttachPredicate
          });
          if (!collectionUri)
            throw new Error(`No collection with predicate ${attachPredicate} attached to ${resourceUri}`);

          await ctx.call('pod-resources.delete', {
            resourceUri: collectionUri,
            actorUri
          });

          await ctx.call('pod-resources.patch', {
            resourceUri,
            triplesToRemove: [
              rdf.quad(rdf.namedNode(resourceUri), rdf.namedNode(expandedAttachPredicate), rdf.namedNode(collectionUri))
            ],
            actorUri
          });
        }
      }
    },

    add: {
      async handler(ctx) {
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
                    rdf.quad(
                      rdf.namedNode(collectionUri),
                      rdf.namedNode('https://www.w3.org/ns/activitystreams#items'),
                      rdf.namedNode(itemUri)
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
    },

    remove: {
      async handler(ctx) {
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
                    rdf.quad(
                      rdf.namedNode(collectionUri),
                      rdf.namedNode('https://www.w3.org/ns/activitystreams#items'),
                      rdf.namedNode(itemUri)
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
    },

    createAndAttachMissing: {
      async handler(ctx) {
        const { shapeTreeUri, attachPredicate, collectionOptions } = ctx.params;

        const expandedAttachPredicate = await ctx.call('jsonld.parser.expandPredicate', { predicate: attachPredicate });

        // Go through all pods
        for (let podOwner of await ctx.call('app-registrations.getRegisteredPods')) {
          this.logger.info(`Going through resources of ${podOwner}...`);
          // Find the container for this shape tree
          const containerUri = await ctx.call('access-grants.getContainerByShapeTree', { shapeTreeUri, podOwner });
          if (!containerUri) throw new Error(`No container found with shape tree ${shapeTreeUri} on pod ${podOwner}`);

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
      }
    },

    getCollectionUriFromResource: {
      // Find the collection attached to a given resource (or undefined if no collection is attached)
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { resource, attachPredicate } = ctx.params;
        const expandedAttachPredicate = await ctx.call('jsonld.parser.expandPredicate', { predicate: attachPredicate });
        const [expandedResource] = await ctx.call('jsonld.parser.expand', { input: resource });
        return expandedResource[expandedAttachPredicate]?.[0]?.['@id'];
      }
    }
  }
} satisfies ServiceSchema;

export default PodCollectionsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [PodCollectionsSchema.name]: typeof PodCollectionsSchema;
    }
  }
}
