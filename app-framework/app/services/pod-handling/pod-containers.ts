import sparqljsModule from 'sparqljs';
const SparqlGenerator = sparqljsModule.Generator;
import rdf from '@rdfjs/data-model';
import { arrayOf, isURL } from '@semapps/ldp';
import FetchPodOrProxyMixin from '../../mixins/fetch-pod-or-proxy.ts';
// @ts-expect-error TS(2305): Module '"moleculer"' has no exported member 'defin... Remove this comment to see the full error message
import { ServiceSchema, defineAction } from 'moleculer';

const PodContainersSchema = {
  name: 'pod-containers' as const,
  mixins: [FetchPodOrProxyMixin],
  started() {
    // @ts-expect-error TS(2339): Property 'sparqlGenerator' does not exist on type ... Remove this comment to see the full error message
    this.sparqlGenerator = new SparqlGenerator({
      /* prefixes, baseIRI, factory, sparqlStar */
    });
  },
  actions: {
    /**
     * Fetch the TypeIndex and return the first containerUri that holds resources of the given type
     * TODO Use some cache mechanism, or fetch all type registration at the app start
     */
    getByType: defineAction({
      params: {
        type: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { type } = ctx.params;

        const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

        const { body: actor } = await this.actions.fetch({
          // @ts-expect-error TS(2304): Cannot find name 'actorUri'.
          url: actorUri,
          headers: {
            'Content-Type': 'application/ld+json'
          },
          // @ts-expect-error TS(18004): No value exists in scope for the shorthand propert... Remove this comment to see the full error message
          actorUri
        });

        if (actor['solid:publicTypeIndex']) {
          const { body: typeIndex } = await this.actions.fetch({
            url: actor['solid:publicTypeIndex'],
            headers: {
              'Content-Type': 'application/ld+json'
            },
            // @ts-expect-error TS(18004): No value exists in scope for the shorthand propert... Remove this comment to see the full error message
            actorUri
          });

          // Go through all TypeRegistration
          for (let registration of arrayOf(typeIndex['solid:hasTypeRegistration'])) {
            // If the TypeRegistration has not been dereferenced, do it
            if (isURL(registration)) {
              ({ body: registration } = await this.actions.fetch({
                url: registration,
                headers: {
                  'Content-Type': 'application/ld+json'
                },
                // @ts-expect-error TS(18004): No value exists in scope for the shorthand propert... Remove this comment to see the full error message
                actorUri
              }));
            }

            const expandedRegisteredTypes = await ctx.call('jsonld.parser.expandTypes', {
              types: registration['solid:forClass']
            });

            if (expandedRegisteredTypes.includes(expandedType)) {
              return registration['solid:instanceContainer'];
            }
          }

          // @ts-expect-error TS(2304): Cannot find name 'actorUri'.
          throw new Error(`No container found for type ${expandedType} in the TypeIndex of ${actorUri}`);
        }
      }
    }),

    attach: defineAction({
      params: {
        containerUri: { type: 'string', optional: false },
        resourceUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
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
                    rdf.triple(
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
    }),

    detach: defineAction({
      params: {
        containerUri: { type: 'string', optional: false },
        resourceUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
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
                    rdf.triple(
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
    })
  }
} satisfies ServiceSchema;

export default PodContainersSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [PodContainersSchema.name]: typeof PodContainersSchema;
    }
  }
}
