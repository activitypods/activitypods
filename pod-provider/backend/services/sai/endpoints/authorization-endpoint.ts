import path from 'path';
import { arrayOf, getId, getDatasetFromUri, getSlugFromUri } from '@semapps/ldp';
import { throw400, throw403 } from '@semapps/middlewares';
import { ServiceSchema } from 'moleculer';

const GROUP_TYPES = ['foaf:Group', 'foaf:Organization', 'as:Group', 'as:Organization', 'Group', 'Organization'];

const AuthorizationEndpointSchema = {
  name: 'authorization-endpoint' as const,
  dependencies: ['api', 'ldp'],
  async started() {
    const basePath = await this.broker.call('ldp.getBasePath');
    await this.broker.call('api.addRoute', {
      route: {
        name: 'sai-authorization-endpoint',
        path: path.join(basePath, '/.auth-agent/authorizations'),
        authorization: true,
        authentication: false,
        bodyParsers: {
          json: true
        },
        aliases: {
          'GET /': 'authorization-endpoint.getAuthorizations',
          'PUT /': 'authorization-endpoint.updateAuthorizations'
        }
      }
    });
  },
  actions: {
    getAuthorizations: {
      /**
       * Get the access authorizations for a single resource, or for all the data matching a shape tree
       */
      async handler(ctx) {
        const { resource: resourceUri, shapeTree: shapeTreeUri } = ctx.params;

        const podOwner = await this.getPodOwner(ctx, resourceUri, shapeTreeUri);
        const isGroup = await this.checkAccess(ctx, podOwner);

        const authorizations = resourceUri
          ? await ctx.call('access-authorizations.listForSingleResource', { resourceUri, webId: podOwner })
          : await ctx.call('access-authorizations.listForShapeTree', { shapeTreeUri, webId: podOwner });

        return {
          ...(resourceUri ? { resourceUri } : { shapeTreeUri }),
          ...(isGroup && (await this.getGrantees(ctx, podOwner))),
          authorizations: authorizations.map((authorization: any) => ({
            grantee: authorization['interop:grantee'],
            accessModes: arrayOf(authorization['interop:accessMode'])
          }))
        };
      }
    },

    updateAuthorizations: {
      /**
       * Mass-update access authorizations for a single resource, or for all the data matching a shape tree
       */
      async handler(ctx) {
        const { resourceUri, shapeTreeUri, authorizations } = ctx.params;

        const podOwner = await this.getPodOwner(ctx, resourceUri, shapeTreeUri);
        const isGroup = await this.checkAccess(ctx, podOwner);

        // The data of a group can only be shared with its roles and its members
        if (isGroup) {
          const { roles, members } = await this.getGrantees(ctx, podOwner);
          const allowedGrantees = [...roles.map((role: any) => role.uri), ...members];
          for (const { grantee } of authorizations) {
            if (!allowedGrantees.includes(grantee)) throw403(`${grantee} is neither a role nor a member of the group`);
          }
        }

        for (const { grantee, accessModes } of authorizations) {
          const params: any = { resourceUri, shapeTreeUri, grantee, accessModes, webId: podOwner };
          if (accessModes.length > 0) {
            // A group may share personal data with its members, but they can't share it further
            if (!isGroup && (await this.isGroup(ctx, grantee))) {
              params.delegationAllowed = true;
              params.delegationLimit = 1;
            }
            await ctx.call(
              resourceUri ? 'access-authorizations.addForSingleResource' : 'access-authorizations.addForShapeTree',
              params
            );
          } else {
            await ctx.call(
              resourceUri
                ? 'access-authorizations.removeForSingleResource'
                : 'access-authorizations.removeForShapeTree',
              params
            );
          }
        }
      }
    }
  },
  methods: {
    async getPodOwner(ctx, resourceUri, shapeTreeUri) {
      if (!resourceUri === !shapeTreeUri) throw400('A resource or a shape tree must be provided');

      if (resourceUri) {
        const account = await ctx.call('auth.account.findByUsername', { username: getDatasetFromUri(resourceUri) });
        if (!account || !resourceUri.startsWith(`${account.webId}/`))
          throw403('Only the owner of a resource can manage its authorizations');
        return account.webId;
      }

      return ctx.params.podOwner || ctx.meta.webId;
    },
    // Return true if the pod is a group
    async checkAccess(ctx, podOwner) {
      const { webId } = ctx.meta;

      const account = await ctx.call('auth.account.findByWebId', { webId: podOwner });
      if (!account) throw403('Only the pod owner can manage its authorizations');
      ctx.meta.dataset = account.username;

      if (webId === podOwner) return !!account.group;
      if (!account.group) throw403('Only the pod owner can manage its authorizations');

      const hasRight = await ctx.call('role-registrations.hasSpecialRight', {
        groupWebId: podOwner,
        agentUri: webId,
        right: 'interop:ManageAccess'
      });
      if (!hasRight) throw403('You need the interop:ManageAccess right on this group');

      return true;
    },
    async isGroup(ctx, agentUri) {
      if (await ctx.call('ldp.remote.isRemote', { resourceUri: agentUri })) {
        const actor = await ctx.call('activitypub.actor.get', { actorUri: agentUri });
        return arrayOf(actor?.type || actor?.['@type']).some(type => GROUP_TYPES.includes(type));
      }
      const account = await ctx.call('auth.account.findByWebId', { webId: agentUri });
      return !!account?.group;
    },
    async getGrantees(ctx, groupWebId) {
      const roles = await ctx.call('role-registrations.listForGroup', { groupWebId });
      const members = await ctx.call('role-registrations.getEffectiveMembers', { groupWebId });
      return {
        roles: roles.map((role: any) => ({
          uri: getId(role),
          id: getSlugFromUri(getId(role)),
          label: role['skos:prefLabel']
        })),
        members: [...new Set(Object.values(members).flat())].filter(uri => uri !== groupWebId)
      };
    }
  }
} satisfies ServiceSchema;

export default AuthorizationEndpointSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AuthorizationEndpointSchema.name]: typeof AuthorizationEndpointSchema;
    }
  }
}
