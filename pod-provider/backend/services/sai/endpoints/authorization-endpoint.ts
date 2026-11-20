import path from 'path';
import { arrayOf, getId, getDatasetFromUri, getSlugFromUri } from '@semapps/ldp';
import { throw400, throw403 } from '@semapps/middlewares';
import { ServiceSchema } from 'moleculer';
import { expandPublicGrantee, getPublicAgentClass } from '../../../utils.ts';

// May be returned as a string by the triplestore
const isTrue = (value: any) => `${value}` === 'true';

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
        const { isGroup, delegateModes } = await this.checkAccess(ctx, podOwner, resourceUri, shapeTreeUri);

        const authorizations = resourceUri
          ? await ctx.call('access-authorizations.listForSingleResource', { resourceUri, webId: podOwner })
          : await ctx.call('access-authorizations.listForShapeTree', { shapeTreeUri, webId: podOwner });

        return {
          ...(resourceUri ? { resourceUri } : { shapeTreeUri }),
          ...(isGroup && (await this.getGrantees(ctx, podOwner))),
          // The rights the user may give, if they are not an admin
          ...(delegateModes && { delegateModes }),
          authorizations: authorizations.map((authorization: any) => ({
            grantee: expandPublicGrantee(authorization['interop:grantee']),
            accessModes: arrayOf(authorization['interop:accessMode']),
            ...(isTrue(authorization['interop:delegationAllowed']) && { delegationAllowed: true })
          }))
        };
      }
    },

    updateAuthorizations: {
      /**
       * Mass-update access authorizations for a single resource, or for all the data matching a shape tree
       */
      async handler(ctx) {
        const { resourceUri, shapeTreeUri } = ctx.params;
        const authorizations = arrayOf(ctx.params.authorizations).map((authorization: any) => ({
          ...authorization,
          grantee: expandPublicGrantee(authorization.grantee)
        }));

        const podOwner = await this.getPodOwner(ctx, resourceUri, shapeTreeUri);
        const { isGroup, delegateModes } = await this.checkAccess(ctx, podOwner, resourceUri, shapeTreeUri);

        // The data of a group can only be shared with its roles and its members
        if (isGroup) {
          const { roles, members } = await this.getGrantees(ctx, podOwner);
          const allowedGrantees = [...roles.map((role: any) => role.uri), ...members];
          for (const { grantee, accessModes } of authorizations) {
            if (!allowedGrantees.includes(grantee) && !getPublicAgentClass(grantee))
              throw403(`${grantee} is neither a role nor a member of the group`);

            // A member allowed to share the data cannot give more than their own rights
            if (delegateModes) {
              if (getPublicAgentClass(grantee)) throw403('Only the admins can make the data of the group public');
              if (roles.some((role: any) => role.uri === grantee && role.isAdmin))
                throw403('The access of the admins cannot be changed');
              if (arrayOf(accessModes).some((mode: string) => !delegateModes.includes(mode)))
                throw403('You cannot give more rights than yours');
            }
          }
        }

        for (const { grantee, accessModes, delegationAllowed } of authorizations) {
          const params: any = { resourceUri, shapeTreeUri, grantee, accessModes, webId: podOwner };
          // The grantee may share the data further
          if (delegationAllowed && !getPublicAgentClass(grantee)) params.delegationAllowed = true;
          if (accessModes.length > 0) {
            // A group may share personal data with its members, but they can't share it further
            if (!isGroup && !getPublicAgentClass(grantee) && (await this.isGroup(ctx, grantee))) {
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
    /**
     * Whether the pod is a group, and the rights of the user if they are only allowed to share this data
     * (not an admin but a member with a grant allowing delegation)
     */
    async checkAccess(
      ctx,
      podOwner,
      resourceUri,
      shapeTreeUri
    ): Promise<{ isGroup: boolean; delegateModes?: string[] }> {
      const { webId } = ctx.meta;

      const account = await ctx.call('auth.account.findByWebId', { webId: podOwner });
      if (!account) throw403('Only the pod owner can manage its authorizations');
      ctx.meta.dataset = account.username;

      if (webId === podOwner) return { isGroup: !!account.group };
      if (!account.group) throw403('Only the pod owner can manage its authorizations');

      const hasRight = await ctx.call('role-registrations.hasSpecialRight', {
        groupWebId: podOwner,
        agentUri: webId,
        right: 'interop:ManageAccess'
      });
      if (hasRight) return { isGroup: true };

      // The right to share all the data of a type allows to share them one by one, not to manage this right
      if (!resourceUri) throw403('You need the interop:ManageAccess right on this group');

      const grant = await this.findDelegationGrant(ctx, webId, podOwner, resourceUri, shapeTreeUri);
      ctx.meta.dataset = account.username;
      if (!grant) throw403('You need the interop:ManageAccess right on this group, or the right to share this data');
      return { isGroup: true, delegateModes: arrayOf(grant['interop:accessMode']) };
    },
    // A grant received by the user, allowing to share this data
    async findDelegationGrant(ctx, webId, podOwner, resourceUri, shapeTreeUri) {
      const userAccount = await ctx.call('auth.account.findByWebId', { webId });
      if (!userAccount) return undefined;

      const dataRegistrationUri = resourceUri
        ? getId(await ctx.call('data-registrations.getByResourceUri', { resourceUri, webId: podOwner }))
        : await ctx.call('data-registrations.getByShapeTree', { shapeTreeUri, podOwner });
      if (!dataRegistrationUri) return undefined;

      const container = await ctx.call(
        'access-grants.list',
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#dataOwner': podOwner,
            'http://www.w3.org/ns/solid/interop#hasDataRegistration': dataRegistrationUri
          },
          webId
        },
        { meta: { dataset: userAccount.username } }
      );
      return arrayOf(container['ldp:contains'])
        .filter(
          (grant: any) =>
            isTrue(grant['interop:delegationAllowed']) &&
            (grant['interop:scopeOfGrant'] === 'interop:AllFromRegistry' ||
              (resourceUri && arrayOf(grant['interop:hasDataInstance']).includes(resourceUri)))
        )
        .sort((a: any, b: any) => arrayOf(b['interop:accessMode']).length - arrayOf(a['interop:accessMode']).length)[0];
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
          label: role['skos:prefLabel'],
          // The admins have full access to the data of the group
          isAdmin: arrayOf(role['interop:hasSpecialRight']).includes('interop:ManageAccess')
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
