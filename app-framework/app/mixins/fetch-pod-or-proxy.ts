import { Readable } from 'stream';
import { FormData } from 'formdata-node';
import { getDatasetFromUri } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';
import { FormDataEncoder } from 'form-data-encoder';
import { stream2buffer } from '../utils.ts';

const Schema = {
  actions: {
    fetch: {
      async handler(ctx: any) {
        let { url, method = 'GET', headers = {}, body, actorUri } = ctx.params;

        const appUri = await ctx.call('app.getUri');

        if (this.isLocal(url, actorUri)) {
          const res = await ctx.call('signature.proxy.query', {
            url,
            method,
            headers,
            body,
            actorUri: appUri
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
            actorUri: appUri
          });
          if (res.status >= 400) {
            this.logger.warn(
              `Could not ${method} ${url} with actor ${actorUri} and body ${body}. Error ${res.status}: ${res.statusText}`
            );
          }
          return res;
        }
      }
    }
  },
  methods: {
    // Return true if the resource is on the Pod of the actor
    isLocal(url, podOwner) {
      const { origin } = new URL(podOwner);
      const dataset = getDatasetFromUri(podOwner);
      const baseUrl = `${origin}/${dataset}`; // URL of type http://localhost:3000/alice
      const aclBase = `${origin}/_acl/${dataset}`; // URL of type http://localhost:3000/_acl/alice
      const aclGroupBase = `${origin}/_groups/${dataset}`; // URL of type http://localhost:3000/_groups/alice
      return (
        url === baseUrl ||
        url.startsWith(baseUrl + '/') ||
        url === aclBase ||
        url.startsWith(aclBase + '/') ||
        url === aclGroupBase ||
        url.startsWith(aclGroupBase + '/')
      );
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
