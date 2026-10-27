import rdf from '@rdfjs/data-model';
import { ControlledContainerMixin, arrayOf, getId, getSlugFromUri } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema } from 'moleculer';

const INTEROP = 'http://www.w3.org/ns/solid/interop#';

const RoleRegistrationsSchema = {
  name: 'role-registrations' as const,
  // @ts-expect-error TS(2322): Type '{ settings: { path: null; acceptedTypes: nul... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:RoleRegistration'],
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  dependencies: ['role-registry'],
  actions: {
    initializeForGroup: {
      async handler(ctx) {
        const { groupWebId, ownerWebId } = ctx.params;

        const containerUri = await this.actions.getContainerUri({ webId: groupWebId }, { parentCtx: ctx });
        await this.actions.waitForContainerCreation({ containerUri }, { parentCtx: ctx });

        const specialRights = ['interop:ReadMembers', 'interop:ManageMembers', 'interop:ManageRoles'];

        await this.actions.createRole(
          {
            groupWebId,
            slug: 'member',
            role: {
              'skos:prefLabel': 'Member',
              'interop:isSystemRole': true,
              'interop:isDefaultRole': true,
              'interop:hasMember': ownerWebId
            }
          },
          { parentCtx: ctx }
        );

        const adminUri = await this.actions.createRole(
          {
            groupWebId,
            slug: 'admin',
            role: { 'skos:prefLabel': 'Admin', 'interop:hasSpecialRight': specialRights }
          },
          { parentCtx: ctx }
        );

        // The Owner role keeps its own rights, as the Admin role may be deleted
        await this.actions.createRole(
          {
            groupWebId,
            slug: 'owner',
            role: {
              'skos:prefLabel': 'Owner',
              'interop:isSystemRole': true,
              'interop:extendsRole': adminUri,
              'interop:hasSpecialRight': [...specialRights, 'apods:ChangeJoinPolicy'],
              'interop:hasMember': ownerWebId
            }
          },
          { parentCtx: ctx }
        );
      }
    },

    createRole: {
      async handler(ctx) {
        const { groupWebId, slug, role } = ctx.params;

        const containerUri = await this.actions.getContainerUri({ webId: groupWebId }, { parentCtx: ctx });
        const authAgentUri = await ctx.call('auth-agent.waitForResourceCreation', { webId: groupWebId });
        const now = new Date().toISOString();

        const roleRegistrationUri = await this.actions.post(
          {
            resource: {
              type: 'interop:RoleRegistration',
              'interop:registeredBy': groupWebId,
              'interop:registeredWith': authAgentUri,
              'interop:registeredAt': now,
              'interop:updatedAt': now,
              ...role
            },
            containerUri,
            slug,
            contentType: MIME_TYPES.JSON,
            webId: groupWebId
          },
          { parentCtx: ctx }
        );

        await ctx.call('role-registry.add', { podOwner: groupWebId, roleRegistrationUri });

        return roleRegistrationUri;
      }
    },

    updateRole: {
      async handler(ctx) {
        const { resourceUri, role } = ctx.params;
        const roleRegistration = await this.actions.get({ resourceUri, webId: 'system' }, { parentCtx: ctx });

        await this.actions.put(
          {
            resource: { ...roleRegistration, ...role, 'interop:updatedAt': new Date().toISOString() },
            contentType: MIME_TYPES.JSON,
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    },

    deleteRole: {
      async handler(ctx) {
        const { groupWebId, resourceUri } = ctx.params;

        const roles = await this.actions.listForGroup({ groupWebId }, { parentCtx: ctx });
        for (const role of roles) {
          if (arrayOf(role['interop:extendsRole']).includes(resourceUri)) {
            await this.actions.patch(
              {
                resourceUri: getId(role),
                triplesToRemove: [
                  rdf.quad(
                    rdf.namedNode(getId(role)),
                    rdf.namedNode(`${INTEROP}extendsRole`),
                    rdf.namedNode(resourceUri)
                  )
                ],
                webId: 'system'
              },
              { parentCtx: ctx }
            );
          }
        }

        await ctx.call('role-registry.remove', { podOwner: groupWebId, roleRegistrationUri: resourceUri });
        await this.actions.delete({ resourceUri, webId: 'system' }, { parentCtx: ctx });
      }
    },

    getUri: {
      async handler(ctx) {
        const { groupWebId, role } = ctx.params;
        const containerUri = await this.actions.getContainerUri({ webId: groupWebId }, { parentCtx: ctx });
        const uris: string[] = await ctx.call('ldp.container.getUris', { containerUri });
        return uris.find(uri => getSlugFromUri(uri) === role);
      }
    },

    listForGroup: {
      async handler(ctx) {
        const { groupWebId } = ctx.params;
        const container = await this.actions.list({ webId: groupWebId }, { parentCtx: ctx });
        return arrayOf(container['ldp:contains']);
      }
    },

    getMembers: {
      // Returns the members with all their roles, including the inherited ones
      async handler(ctx) {
        const { groupWebId } = ctx.params;
        const roles = await this.actions.listForGroup({ groupWebId }, { parentCtx: ctx });
        const effectiveMembers = this.getEffectiveMembers(roles);

        const members: Record<string, string[]> = {};
        for (const role of roles) {
          for (const memberUri of effectiveMembers.get(getId(role))!) {
            members[memberUri] = [...(members[memberUri] || []), getSlugFromUri(getId(role))];
          }
        }
        return members;
      }
    },

    listForAgent: {
      async handler(ctx) {
        const { groupWebId, agentUri, direct = false } = ctx.params;
        const roles = await this.actions.listForGroup({ groupWebId }, { parentCtx: ctx });
        if (direct) return roles.filter((role: any) => arrayOf(role['interop:hasMember']).includes(agentUri));

        const effectiveMembers = this.getEffectiveMembers(roles);
        return roles.filter((role: any) => effectiveMembers.get(getId(role))!.has(agentUri));
      }
    },

    hasRole: {
      async handler(ctx) {
        const { groupWebId, agentUri, role, direct = false } = ctx.params;
        const roles = await this.actions.listForAgent({ groupWebId, agentUri, direct }, { parentCtx: ctx });
        return roles.some((r: any) => getSlugFromUri(getId(r)) === role);
      }
    },

    hasSpecialRight: {
      async handler(ctx) {
        const { groupWebId, agentUri, right } = ctx.params;
        const roles = await this.actions.listForAgent({ groupWebId, agentUri }, { parentCtx: ctx });
        return roles.some((role: any) => arrayOf(role['interop:hasSpecialRight']).includes(right));
      }
    },

    addMember: {
      async handler(ctx) {
        const { roleRegistrationUri, agentUri } = ctx.params;
        await this.updateMembers(ctx, roleRegistrationUri, {
          triplesToAdd: [this.memberQuad(roleRegistrationUri, agentUri)]
        });
      }
    },

    removeMember: {
      async handler(ctx) {
        const { roleRegistrationUri, agentUri } = ctx.params;
        await this.updateMembers(ctx, roleRegistrationUri, {
          triplesToRemove: [this.memberQuad(roleRegistrationUri, agentUri)]
        });
      }
    }
  },
  methods: {
    getEffectiveMembers(roles: any[]) {
      const members = new Map<string, Set<string>>(
        roles.map(role => [getId(role), new Set(arrayOf(role['interop:hasMember']))])
      );

      let changed = true;
      while (changed) {
        changed = false;
        for (const role of roles) {
          for (const extendedRoleUri of arrayOf(role['interop:extendsRole'])) {
            const extendedMembers = members.get(extendedRoleUri);
            if (!extendedMembers) continue;
            for (const memberUri of members.get(getId(role))!) {
              if (!extendedMembers.has(memberUri)) {
                extendedMembers.add(memberUri);
                changed = true;
              }
            }
          }
        }
      }

      // Every agent with a role is a member of the default role
      const allMembers = new Set([...members.values()].flatMap(set => [...set]));
      for (const role of roles) {
        if (role['interop:isDefaultRole'] === true) members.set(getId(role), allMembers);
      }

      return members;
    },
    memberQuad(roleRegistrationUri, agentUri) {
      return rdf.quad(
        rdf.namedNode(roleRegistrationUri),
        rdf.namedNode(`${INTEROP}hasMember`),
        rdf.namedNode(agentUri)
      );
    },
    async updateMembers(ctx, roleRegistrationUri, { triplesToAdd = [], triplesToRemove = [] }) {
      const roleRegistration = await this.actions.get(
        { resourceUri: roleRegistrationUri, webId: 'system' },
        { parentCtx: ctx }
      );
      const updatedAt = rdf.namedNode(`${INTEROP}updatedAt`);
      const dateTime = rdf.namedNode('http://www.w3.org/2001/XMLSchema#dateTime');

      await this.actions.patch(
        {
          resourceUri: getId(roleRegistration),
          triplesToAdd: [
            ...triplesToAdd,
            rdf.quad(rdf.namedNode(roleRegistrationUri), updatedAt, rdf.literal(new Date().toISOString(), dateTime))
          ],
          triplesToRemove: [
            ...triplesToRemove,
            rdf.quad(
              rdf.namedNode(roleRegistrationUri),
              updatedAt,
              rdf.literal(roleRegistration['interop:updatedAt'], dateTime)
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    }
  }
} satisfies ServiceSchema;

export default RoleRegistrationsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [RoleRegistrationsSchema.name]: typeof RoleRegistrationsSchema;
    }
  }
}
