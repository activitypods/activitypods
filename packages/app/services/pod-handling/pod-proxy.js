const { Readable } = require('stream');
const { FormData } = require('formdata-node');
const { FormDataEncoder } = require('form-data-encoder');

function stream2buffer(stream) {
  return new Promise((resolve, reject) => {
    const _buf = [];
    stream.on('data', chunk => _buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(_buf)));
    stream.on('error', err => reject(err));
  });
}

module.exports = {
  name: 'pod-proxy',
  actions: {
    async get(ctx) {
      const { resourceUri, actorUri } = ctx.params;

      return this.actions.transfer({
        url: resourceUri,
        method: 'GET',
        headers: {
          Accept: 'application/ld+json'
        },
        actorUri
      });
    },
    async post(ctx) {
      const { containerUri, resource, actorUri } = ctx.params;

      // Adds the default context, if it is missing
      if (!resource['@context']) {
        resource = {
          '@context': await ctx.call('jsonld.context.get'),
          ...resource
        };
      }

      return await this.actions.transfer({
        url: containerUri,
        method: 'POST',
        headers: {
          'Content-Type': 'application/ld+json'
        },
        body: JSON.stringify(resource),
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

      return await this.actions.transfer({
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

      return await this.actions.transfer({
        url: resourceUri,
        method: 'DELETE',
        actorUri
      });
    },
    async transfer(ctx) {
      let { url, method, headers, body, actorUri } = ctx.params;

      const app = await ctx.call('app.get');

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
};
