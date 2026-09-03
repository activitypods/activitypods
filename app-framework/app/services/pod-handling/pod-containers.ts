import sparqljsModule from 'sparqljs';
const SparqlGenerator = sparqljsModule.Generator;
import { ServiceSchema } from 'moleculer';
import rdf from '@rdfjs/data-model';
import { arrayOf, hasType } from '@semapps/ldp';
import FetchPodOrProxyMixin from '../../mixins/fetch-pod-or-proxy.ts';

const PodContainersService = {
  name: 'pod-containers' as const,
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
      async handler(ctx: any) {
        const { type, actorUri } = ctx.params;

        const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

        const { body: actor } = await this.actions.fetch(
          {
            url: actorUri,
            headers: {
              'Content-Type': 'application/ld+json'
            },
            actorUri
          },
          { parentCtx: ctx }
        );

        if (actor['solid:publicTypeIndex']) {
          const { body: typeIndex } = await this.actions.fetch(
            {
              url: actor['solid:publicTypeIndex'],
              headers: {
                'Content-Type': 'application/ld+json'
              },
              actorUri
            },
            { parentCtx: ctx }
          );

          // Go through all TypeRegistration
          for (let registration of arrayOf(typeIndex['@graph']).filter(n => hasType(n, 'solid:TypeRegistration'))) {
            const expandedRegisteredTypes = await ctx.call('jsonld.parser.expandTypes', {
              types: registration['solid:forClass'],
              context: typeIndex['@context']
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
      async handler(ctx: any) {
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
                    rdf.quad(
                      rdf.namedNode(containerUri),
                      rdf.namedNode('http://www.w3.org/ns/ldp#contains'),
                      rdf.namedNode(resourceUri)
                    )
                  ]
                }
              ]
            }
          ]
        };

        await this.actions.fetch(
          {
            url: containerUri,
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/sparql-update'
            },
            body: this.sparqlGenerator.stringify(sparqlUpdate),
            actorUri
          },
          { parentCtx: ctx }
        );
      }
    },

    detach: {
      params: {
        containerUri: { type: 'string', optional: false },
        resourceUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx: any) {
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
                    rdf.quad(
                      rdf.namedNode(containerUri),
                      rdf.namedNode('http://www.w3.org/ns/ldp#contains'),
                      rdf.namedNode(resourceUri)
                    )
                  ]
                }
              ]
            }
          ]
        };

        await this.actions.fetch(
          {
            url: containerUri,
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/sparql-update'
            },
            body: this.sparqlGenerator.stringify(sparqlUpdate),
            actorUri
          },
          { parentCtx: ctx }
        );
      }
    }
  }
} satisfies ServiceSchema;

export default PodContainersService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [PodContainersService.name]: typeof PodContainersService;
    }
  }
}
