import sparqljs from 'sparqljs';
import { ServiceSchema } from 'moleculer';
import FetchPodOrProxyMixin from '../../mixins/fetch-pod-or-proxy.ts';

const SparqlGenerator = sparqljs.Generator;

const PodResourcesSchema = {
  name: 'pod-resources' as const,
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
      async handler(ctx: any) {
        const { containerUri, actorUri } = ctx.params;
        let { resource } = ctx.params;
        // Adds the default context, if it is missing
        if (!resource['@context']) {
          resource = {
            '@context': await ctx.call('jsonld.context.get'),
            ...resource
          };
        }

        const { ok, headers } = await this.actions.fetch(
          {
            url: containerUri,
            method: 'POST',
            headers: {
              'Content-Type': 'application/ld+json'
            },
            body: JSON.stringify(resource),
            actorUri
          },
          { parentCtx: ctx }
        );

        if (ok) {
          return headers.get('Location');
        } else {
          return false;
        }
      }
    },

    list: {
      params: {
        containerUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx: any) {
        const { containerUri, actorUri } = ctx.params;

        return await this.actions.fetch(
          {
            url: containerUri,
            method: 'GET',
            headers: {
              Accept: 'application/ld+json',
              JsonLdContext: JSON.stringify(await ctx.call('jsonld.context.get'))
            },
            actorUri
          },
          { parentCtx: ctx }
        );
      }
    },

    get: {
      params: {
        resourceUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx: any) {
        const { resourceUri, actorUri } = ctx.params;

        return await this.actions.fetch(
          {
            url: resourceUri,
            method: 'GET',
            headers: {
              Accept: 'application/ld+json',
              JsonLdContext: JSON.stringify(await ctx.call('jsonld.context.get'))
            },
            actorUri
          },
          { parentCtx: ctx }
        );
      }
    },

    patch: {
      params: {
        resourceUri: { type: 'string', optional: false },
        triplesToAdd: { type: 'array', optional: true },
        triplesToRemove: { type: 'array', optional: true },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx: any) {
        const { resourceUri, triplesToAdd, triplesToRemove, actorUri } = ctx.params;

        let sparqlUpdate = {
          type: 'update',
          updates: []
        };

        if (triplesToAdd) {
          // @ts-expect-error TS(2345): Argument of type '{ updateType: string; insert: { ... Remove this comment to see the full error message
          sparqlUpdate.updates.push({
            updateType: 'insert',
            insert: [{ type: 'bgp', triples: triplesToAdd }]
          });
        }

        if (triplesToRemove) {
          // @ts-expect-error TS(2345): Argument of type '{ updateType: string; delete: { ... Remove this comment to see the full error message
          sparqlUpdate.updates.push({
            updateType: 'delete',
            delete: [{ type: 'bgp', triples: triplesToRemove }]
          });
        }

        return await this.actions.fetch(
          {
            url: resourceUri,
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

    put: {
      params: {
        resource: { type: 'object', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx: any) {
        let { resource, actorUri } = ctx.params;
        const resourceUri = resource.id || resource['@id'];

        // Adds the default context, if it is missing
        if (!resource['@context']) {
          resource = {
            '@context': await ctx.call('jsonld.context.get'),
            ...resource
          };
        }

        return await this.actions.fetch(
          {
            url: resourceUri,
            method: 'PUT',
            headers: {
              'Content-Type': 'application/ld+json'
            },
            body: JSON.stringify(resource),
            actorUri
          },
          { parentCtx: ctx }
        );
      }
    },

    delete: {
      params: {
        resourceUri: { type: 'string', optional: false },
        actorUri: { type: 'string', optional: false }
      },
      async handler(ctx: any) {
        const { resourceUri, actorUri } = ctx.params;

        return await this.actions.fetch(
          {
            url: resourceUri,
            method: 'DELETE',
            actorUri
          },
          { parentCtx: ctx }
        );
      }
    }
  }
} satisfies ServiceSchema;

export default PodResourcesSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [PodResourcesSchema.name]: typeof PodResourcesSchema;
    }
  }
}
