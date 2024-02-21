const { Readable } = require('stream');
const { FormData } = require('formdata-node');
const { FormDataEncoder } = require('form-data-encoder');
const SparqlGenerator = require('sparqljs').Generator;
const { stream2buffer } = require('../../utils');

module.exports = {
  name: 'pod-resources',
  started() {
    this.sparqlGenerator = new SparqlGenerator({
      /* prefixes, baseIRI, factory, sparqlStar */
    });
  },
  actions: {
    async post(ctx) {
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
    },
    async list(ctx) {
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
    },
    async get(ctx) {
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
    },
    async patch(ctx) {
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
    },
    async put(ctx) {
      const { resource, actorUri } = ctx.params;

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
    },
    async delete(ctx) {
      const { resourceUri, actorUri } = ctx.params;

      await this.actions.fetch({
        url: resourceUri,
        method: 'DELETE',
        actorUri
      });
    },
    async fetch(ctx) {
      let { url, method, headers, body, actorUri } = ctx.params;

      const app = await ctx.call('app.get');

      // True if the resource is not on the pod of the actor
      const isLocal = url === actorUri || url.startsWith(actorUri + '/');

      if (isLocal) {
        return await ctx.call('signature.proxy.query', {
          url,
          method,
          headers,
          body,
          actorUri: app.id || app['@id']
        });
      } else {
        // Remote resources. We will go through the Pod proxy.
        const actor = await ctx.call('activitypub.actor.get', { actorUri });
        const proxyUrl = actor.endpoints?.proxyUrl;
        if (!proxyUrl) throw new Error(`No proxy endpoint found for actor ${actorUri}`);

        // Convert Headers object if necessary (otherwise we can't stringify it below)
        // Note: if we use NodeJS built-in Headers instead of node-fetch Headers, the constructor name is _Headers
        if (
          headers &&
          typeof headers === 'object' &&
          (headers.constructor.name === 'Headers' || headers.constructor.name === '_Headers')
        ) {
          headers = Object.fromEntries(headers);
        }

        const formData = new FormData();

        formData.append('id', url);
        formData.append('method', method || 'GET');
        formData.append('headers', JSON.stringify(headers));
        if (body) formData.append('body', body);

        const encoder = new FormDataEncoder(formData);

        return await ctx.call('signature.proxy.query', {
          url: proxyUrl,
          method: 'POST',
          headers: encoder.headers,
          body: await stream2buffer(Readable.from(encoder)),
          actorUri: app.id || app['@id']
        });
      }
    }
  }
};
