import fetch from 'node-fetch';
import LinkHeader from 'http-link-header';
import { getAclUriFromResourceUri } from '@semapps/webacl';
import { arrayOf } from '@semapps/ldp';
import FetchPodOrProxyMixin from '../../mixins/fetch-pod-or-proxy.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const PodPermissionsSchema = {
  name: 'pod-permissions' as const,
  mixins: [FetchPodOrProxyMixin],
  actions: {
    get: defineAction({
      async handler(ctx) {
        const { uri, actorUri } = ctx.params;

        const { status, body } = await this.actions.fetch({
          url: await this.getAclUri(uri, actorUri),
          headers: {
            Accept: 'application/ld+json'
          },
          actorUri
        });

        return status === 200 ? body['@graph'] : false;
      }
    }),

    add: defineAction({
      async handler(ctx) {
        const { uri, agentUri, agentPredicate, mode, actorUri } = ctx.params;

        if (!['acl:agent', 'acl:agentGroup', 'acl:agentClass'].includes(agentPredicate)) {
          throw new Error(`The agentPredicate must be 'acl:agent', 'acl:agentGroup' or 'acl:agentClass'`);
        }

        if (!['acl:Read', 'acl:Append', 'acl:Write', 'acl:Control'].includes(mode)) {
          throw new Error(`The mode must be 'acl:Read', 'acl:Append', 'acl:Write' or 'acl:Control'`);
        }

        const aclUri = await this.getAclUri(uri, actorUri);

        const { status } = await this.actions.fetch({
          url: aclUri,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/ld+json'
          },
          body: JSON.stringify({
            '@context': this.getAclContext(aclUri),
            '@graph': [
              {
                '@id': `#${mode.replace('acl:', '')}`,
                '@type': 'acl:Authorization',
                [agentPredicate]: agentUri,
                'acl:accessTo': uri,
                'acl:mode': mode
              }
            ]
          }),
          actorUri
        });

        return status === 204;
      }
    }),

    remove: defineAction({
      async handler(ctx) {
        const { uri, agentUri, agentPredicate, mode, actorUri } = ctx.params;

        if (!['acl:agent', 'acl:agentGroup', 'acl:agentClass'].includes(agentPredicate)) {
          throw new Error(`The agentPredicate must be 'acl:agent', 'acl:agentGroup' or 'acl:agentClass'`);
        }

        if (!['acl:Read', 'acl:Append', 'acl:Write', 'acl:Control'].includes(mode)) {
          throw new Error(`The mode must be 'acl:Read', 'acl:Append', 'acl:Write' or 'acl:Control'`);
        }

        // We have no API to remove permissions, so first get the permissions, then use PUT to update them.
        // There is an issue to improve this: https://github.com/assemblee-virtuelle/semapps/issues/1234
        const currentPermissions = await this.actions.get({ uri, actorUri }, { parentCtx: ctx });

        const updatedPermissions = currentPermissions
          .filter(authorization => !authorization['@id'].includes('#Default'))
          .map(authorization => {
            const modes = arrayOf(authorization['acl:mode']);
            let agents = arrayOf(authorization[agentPredicate]);
            if (modes.includes(mode) && agents.includes(agentUri)) {
              agents = agents.filter(agent => agent !== agentUri);
            }
            return { ...authorization, [agentPredicate]: agents };
          })
          .filter(authorization => arrayOf(authorization[agentPredicate]).length > 0);

        const aclUri = await this.getAclUri(uri, actorUri);

        const { status } = await this.actions.fetch({
          url: aclUri,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/ld+json'
          },
          body: JSON.stringify({
            '@context': this.getAclContext(aclUri),
            '@graph': updatedPermissions
          }),
          actorUri
        });

        return status === 204;
      }
    })
  },
  methods: {
    async getAclUri(uri, podOwner) {
      try {
        const { headers } = await fetch(uri, { method: 'HEAD' });
        const linkHeader = LinkHeader.parse(headers.get('Link'));
        const aclLinkHeader = linkHeader.rel('acl');
        return aclLinkHeader[0].uri;
      } catch (e) {
        this.logger.warn(`Could not get link header for ${uri}`);
        // Try to guess it from the URL
        const { origin } = new URL(podOwner);
        return getAclUriFromResourceUri(origin, uri);
      }
    },
    getAclContext(aclUri) {
      return {
        '@base': aclUri,
        acl: 'http://www.w3.org/ns/auth/acl#',
        foaf: 'http://xmlns.com/foaf/0.1/',
        'acl:agent': { '@type': '@id' },
        'acl:agentGroup': { '@type': '@id' },
        'acl:agentClass': { '@type': '@id' },
        'acl:mode': { '@type': '@id' },
        'acl:accessTo': { '@type': '@id' }
      };
    }
  }
} satisfies ServiceSchema;

export default PodPermissionsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [PodPermissionsSchema.name]: typeof PodPermissionsSchema;
    }
  }
}
