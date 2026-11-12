import { arrayOf, getId, getDatasetFromUri } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema } from 'moleculer';
import { getScopeOfGrant } from './access-grants.ts';

const INTEROP = 'http://www.w3.org/ns/solid/interop#';

const sameItems = (a: any, b: any) => {
  const itemsA = arrayOf(a);
  const itemsB = arrayOf(b);
  return itemsA.length === itemsB.length && itemsA.every(item => itemsB.includes(item));
};

// Authorizations with a role as grantee generate one grant per effective member of the role
// For the data of the pod, the rights are given through the WAC group of the role
// For the data shared with the pod, a delegated grant is issued on the data owner's storage for each member
const RoleAccessSchema = {
  name: 'role-access' as const,
  dependencies: ['role-registrations', 'access-authorizations', 'access-grants', 'permissions-mapper'],
  actions: {
    addFromAuthorization: {
      async handler(ctx) {
        const { authorization } = ctx.params;
        const groupWebId = authorization['interop:grantedBy'];

        let replacedAuthorization;
        if (this.isOwnData(authorization)) {
          if (authorization['interop:replaces']) {
            replacedAuthorization = await ctx.call('access-authorizations.get', {
              resourceUri: authorization['interop:replaces'],
              webId: groupWebId
            });
            await this.setPermissions(ctx, replacedAuthorization, false);
          }
          await this.setPermissions(ctx, authorization, true);
        }

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

        if (this.isOwnData(authorization) && !isReplacing) await this.setPermissions(ctx, authorization, false);

        for (const grant of await this.listGrants(ctx, authorization)) {
          await this.deleteGrant(ctx, authorization, grant, isReplacing);
        }
      }
    },

    addFromReceivedGrant: {
      // Data shared with a group with the right to delegate it is shared with the members of its default role
      async handler(ctx) {
        const { grant, podOwner } = ctx.params;

        if (grant['interop:delegationAllowed'] !== true) return;

        const account = await ctx.call('auth.account.findByWebId', { webId: podOwner });
        if (!account?.group) return;

        const roleUri = await ctx.call('role-registrations.getUri', { groupWebId: podOwner, role: 'member' });
        const scope = grant['interop:scopeOfGrant'];

        const container = await ctx.call('access-authorizations.list', {
          filters: {
            [`${INTEROP}dataOwner`]: grant['interop:dataOwner'],
            [`${INTEROP}grantee`]: roleUri,
            [`${INTEROP}hasDataRegistration`]: grant['interop:hasDataRegistration']
          },
          webId: podOwner
        });
        const exists = arrayOf(container['ldp:contains']).some(
          (authorization: any) =>
            authorization['interop:scopeOfAuthorization'] === scope &&
            sameItems(authorization['interop:accessMode'], grant['interop:accessMode']) &&
            sameItems(authorization['interop:hasDataInstance'], grant['interop:hasDataInstance'])
        );
        if (exists) return;

        await ctx.call('access-authorizations.post', {
          resource: {
            type: 'interop:AccessAuthorization',
            'interop:dataOwner': grant['interop:dataOwner'],
            'interop:grantedBy': podOwner,
            'interop:grantee': roleUri,
            'interop:granteeType': 'interop:SocialAgent',
            'interop:registeredShapeTree': grant['interop:registeredShapeTree'],
            'interop:hasDataRegistration': grant['interop:hasDataRegistration'],
            'interop:hasDataInstance': grant['interop:hasDataInstance'],
            'interop:accessMode': grant['interop:accessMode'],
            'interop:scopeOfAuthorization': scope
          },
          contentType: MIME_TYPES.JSON,
          webId: podOwner
        });
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
          if (roleMembers) {
            await this.syncGrants(ctx, authorization, roleMembers);
          }
        }
      }
    }
  },
  methods: {
    isOwnData(authorization) {
      return authorization['interop:dataOwner'] === authorization['interop:grantedBy'];
    },
    // The delegated grants are issued and deleted by the group, in a context of their own
    callAsGroup(authorization, actionName: string, params: any) {
      const groupWebId = authorization['interop:grantedBy'];
      return this.broker.call(actionName, params, {
        meta: { webId: groupWebId, dataset: getDatasetFromUri(groupWebId) }
      });
    },
    async listGrants(ctx, authorization) {
      // The grants are not linked to the authorization: they are found by their content,
      // which is unique for a role, as authorizations with the same access modes are merged
      const container = await ctx.call(
        this.isOwnData(authorization) ? 'access-grants.list' : 'delegated-access-grants.list',
        {
          filters: {
            [`${INTEROP}derivedFromRoleRegistration`]: authorization['interop:grantee'],
            [`${INTEROP}dataOwner`]: authorization['interop:dataOwner'],
            [`${INTEROP}hasDataRegistration`]: authorization['interop:hasDataRegistration']
          },
          webId: authorization['interop:grantedBy']
        }
      );
      return arrayOf(container['ldp:contains']).filter(
        (grant: any) =>
          grant['interop:scopeOfGrant'] === getScopeOfGrant(authorization) &&
          sameItems(grant['interop:accessMode'], authorization['interop:accessMode']) &&
          sameItems(grant['interop:hasDataInstance'], authorization['interop:hasDataInstance'])
      );
    },
    async deleteGrant(ctx, authorization, grant, isReplacing?: boolean) {
      if (this.isOwnData(authorization)) {
        await ctx.call('access-grants.delete', { resourceUri: getId(grant), webId: 'system', isReplacing });
      } else {
        await this.callAsGroup(authorization, 'delegated-access-grants.remoteDelete', { delegatedGrant: grant });
      }
    },
    async syncGrants(ctx, authorization, membersUris: string[], replacedAuthorization?: any) {
      const dataOwner = authorization['interop:dataOwner'];
      const groupWebId = authorization['interop:grantedBy'];
      const members = membersUris.filter(uri => uri !== dataOwner && uri !== groupWebId);
      const grants = await this.listGrants(ctx, authorization);
      const replacedGrants = replacedAuthorization ? await this.listGrants(ctx, replacedAuthorization) : [];

      for (const memberUri of members) {
        if (grants.some((grant: any) => grant['interop:grantee'] === memberUri)) continue;

        if (this.isOwnData(authorization)) {
          const replacedGrant = replacedGrants.find((grant: any) => grant['interop:grantee'] === memberUri);

          await ctx.call('access-grants.post', {
            resource: {
              ...authorization,
              id: undefined,
              type: 'interop:AccessGrant',
              'interop:grantee': memberUri,
              'interop:grantedBy': dataOwner,
              'interop:scopeOfGrant': getScopeOfGrant(authorization),
              'interop:scopeOfAuthorization': undefined,
              'interop:replaces': replacedGrant && getId(replacedGrant),
              'interop:derivedFromRoleRegistration': authorization['interop:grantee']
            },
            contentType: MIME_TYPES.JSON,
            webId: dataOwner
          });
        } else {
          await this.callAsGroup(authorization, 'delegated-access-grants.generateFromAuthorization', {
            authorization: {
              ...authorization,
              'interop:grantee': memberUri,
              'interop:derivedFromRoleRegistration': authorization['interop:grantee']
            }
          });
        }
      }

      for (const grant of grants) {
        if (!members.includes(grant['interop:grantee'])) await this.deleteGrant(ctx, authorization, grant);
      }
    },
    async setPermissions(ctx, authorization, granted: boolean) {
      const groupUri = await ctx.call('role-registrations.getWacGroupUri', {
        groupWebId: authorization['interop:dataOwner'],
        roleRegistrationUri: authorization['interop:grantee']
      });

      await ctx.call(
        granted ? 'permissions-mapper.addPermissionsFromGrant' : 'permissions-mapper.removePermissionsFromGrant',
        { grant: { ...authorization, 'interop:scopeOfGrant': getScopeOfGrant(authorization) }, groupUri }
      );
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
