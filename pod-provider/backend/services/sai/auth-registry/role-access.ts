import { arrayOf, getId } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema } from 'moleculer';

const INTEROP = 'http://www.w3.org/ns/solid/interop#';

const sameItems = (a: any, b: any) => {
  const itemsA = arrayOf(a);
  const itemsB = arrayOf(b);
  return itemsA.length === itemsB.length && itemsA.every(item => itemsB.includes(item));
};

// Authorizations with a role as grantee give rights through the WAC group of the role,
// and generate one access grant per effective member of the role
const RoleAccessSchema = {
  name: 'role-access' as const,
  dependencies: ['role-registrations', 'access-authorizations', 'access-grants', 'permissions-mapper'],
  actions: {
    addFromAuthorization: {
      async handler(ctx) {
        const { authorization } = ctx.params;
        const groupWebId = authorization['interop:dataOwner'];

        let replacedAuthorization;
        if (authorization['interop:replaces']) {
          replacedAuthorization = await ctx.call('access-authorizations.get', {
            resourceUri: authorization['interop:replaces'],
            webId: groupWebId
          });
          await this.setPermissions(ctx, replacedAuthorization, false);
        }
        await this.setPermissions(ctx, authorization, true);

        const members = await ctx.call('role-registrations.getEffectiveMembers', { groupWebId });
        await this.syncGrants(
          ctx,
          authorization,
          members[authorization['interop:grantee']] || [],
          replacedAuthorization
        );
      }
    },

    removeFromAuthorization: {
      async handler(ctx) {
        const { authorization, isReplacing } = ctx.params;

        if (!isReplacing) await this.setPermissions(ctx, authorization, false);

        for (const grant of await this.listGrants(ctx, authorization)) {
          await ctx.call('access-grants.delete', { resourceUri: getId(grant), webId: 'system', isReplacing });
        }
      }
    },

    syncGrants: {
      // Create or delete the grants of the members, after the members of the roles changed
      async handler(ctx) {
        const { groupWebId } = ctx.params;

        const containerUri = await ctx.call('access-authorizations.getContainerUri', { webId: groupWebId });
        await ctx.call('access-authorizations.waitForContainerCreation', { containerUri });

        const members = await ctx.call('role-registrations.getEffectiveMembers', { groupWebId });
        const container = await ctx.call('access-authorizations.list', { webId: groupWebId });

        for (const authorization of arrayOf(container['ldp:contains'])) {
          const roleMembers = members[authorization['interop:grantee']];
          if (roleMembers && authorization['interop:dataOwner'] === groupWebId) {
            await this.syncGrants(ctx, authorization, roleMembers);
          }
        }
      }
    }
  },
  methods: {
    async listGrants(ctx, authorization) {
      // The grants are not linked to the authorization: they are found by their content,
      // which is unique for a role, as authorizations with the same access modes are merged
      const container = await ctx.call('access-grants.list', {
        filters: {
          [`${INTEROP}derivedFromRoleRegistration`]: authorization['interop:grantee'],
          [`${INTEROP}hasDataRegistration`]: authorization['interop:hasDataRegistration']
        },
        webId: authorization['interop:dataOwner']
      });
      return arrayOf(container['ldp:contains']).filter(
        (grant: any) =>
          grant['interop:scopeOfGrant'] === this.getScopeOfGrant(authorization) &&
          sameItems(grant['interop:accessMode'], authorization['interop:accessMode']) &&
          sameItems(grant['interop:hasDataInstance'], authorization['interop:hasDataInstance'])
      );
    },
    async syncGrants(ctx, authorization, membersUris: string[], replacedAuthorization?: any) {
      const dataOwner = authorization['interop:dataOwner'];
      const members = membersUris.filter(uri => uri !== dataOwner);
      const grants = await this.listGrants(ctx, authorization);
      const replacedGrants = replacedAuthorization ? await this.listGrants(ctx, replacedAuthorization) : [];

      for (const memberUri of members) {
        if (grants.some((grant: any) => grant['interop:grantee'] === memberUri)) continue;
        const replacedGrant = replacedGrants.find((grant: any) => grant['interop:grantee'] === memberUri);

        await ctx.call('access-grants.post', {
          resource: {
            ...authorization,
            id: undefined,
            type: 'interop:AccessGrant',
            'interop:grantee': memberUri,
            'interop:grantedBy': dataOwner,
            'interop:scopeOfGrant': this.getScopeOfGrant(authorization),
            'interop:scopeOfAuthorization': undefined,
            'interop:replaces': replacedGrant && getId(replacedGrant),
            'interop:derivedFromRoleRegistration': authorization['interop:grantee']
          },
          contentType: MIME_TYPES.JSON,
          webId: dataOwner
        });
      }

      for (const grant of grants) {
        if (!members.includes(grant['interop:grantee'])) {
          await ctx.call('access-grants.delete', { resourceUri: getId(grant), webId: 'system' });
        }
      }
    },
    async setPermissions(ctx, authorization, granted: boolean) {
      const groupUri = await ctx.call('role-registrations.getWacGroupUri', {
        groupWebId: authorization['interop:dataOwner'],
        roleRegistrationUri: authorization['interop:grantee']
      });

      await ctx.call(
        granted ? 'permissions-mapper.addPermissionsFromGrant' : 'permissions-mapper.removePermissionsFromGrant',
        { grant: { ...authorization, 'interop:scopeOfGrant': this.getScopeOfGrant(authorization) }, groupUri }
      );
    },
    getScopeOfGrant(authorization) {
      return authorization['interop:scopeOfAuthorization'] === 'interop:All'
        ? 'interop:AllFromRegistry'
        : authorization['interop:scopeOfAuthorization'];
    }
  }
} satisfies ServiceSchema;

export default RoleAccessSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [RoleAccessSchema.name]: typeof RoleAccessSchema;
    }
  }
}
