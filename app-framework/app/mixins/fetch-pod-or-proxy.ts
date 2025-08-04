import { Readable } from 'stream';
import { FormData } from 'formdata-node';
import { FormDataEncoder } from 'form-data-encoder';
import { stream2buffer } from '../utils.ts';
// @ts-expect-error TS(2305): Module '"moleculer"' has no exported member 'defin... Remove this comment to see the full error message
import { ServiceSchema, defineAction } from 'moleculer';

const Schema = {
  actions: {
    fetch: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        let { url, method = 'GET', headers = {}, body, actorUri } = ctx.params;

        const app = await ctx.call('app.get');

        if (this.isLocal(url, actorUri)) {
          const res = await ctx.call('signature.proxy.query', {
            url,
            method,
            headers,
            body,
            actorUri: app.id || app['@id']
          });
          if (res.status >= 400) {
            this.logger.warn(
              `Could not ${method} ${url} with actor ${actorUri} and body ${body}. Error ${res.status}: ${res.statusText}`
            );
          }
          return res;
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

          const res = await ctx.call('signature.proxy.query', {
            url: proxyUrl,
            method: 'POST',
            headers: encoder.headers,
            body: await stream2buffer(Readable.from(encoder)),
            actorUri: app.id || app['@id']
          });
          if (res.status >= 400) {
            this.logger.warn(
              `Could not ${method} ${url} with actor ${actorUri} and body ${body}. Error ${res.status}: ${res.statusText}`
            );
          }
          return res;
        }
      }
    })
  },
  methods: {
    // Return true if the resource is on the Pod of the actor
    isLocal(url, podOwner) {
      const { origin, pathname } = new URL(podOwner);
      const aclBase = `${origin}/_acl${pathname}`; // URL of type http://localhost:3000/_acl/alice
      const aclGroupBase = `${origin}/_groups${pathname}`; // URL of type http://localhost:3000/_groups/alice
      return (
        url === podOwner ||
        url.startsWith(podOwner + '/') ||
        url === aclBase ||
        url.startsWith(aclBase + '/') ||
        url === aclGroupBase ||
        url.startsWith(aclGroupBase + '/')
      );
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
