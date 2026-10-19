import urlJoin from 'url-join';
import rdf from '@rdfjs/data-model';
import { ControlledContainerMixin, arrayOf, getId } from '@semapps/ldp';
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
        const authAgentUri = await ctx.call('auth-agent.waitForResourceCreation', { webId: groupWebId });

        const roles = [
          {
            slug: 'member',
            'skos:prefLabel': 'Member',
            'interop:isDefaultRole': true
          },
          {
            slug: 'owner',
            'skos:prefLabel': 'Owner',
            'interop:hasSpecialRight': ['interop:ReadMembers', 'interop:ManageMembers', 'interop:ManageRoles']
          }
        ];

        for (const { slug, ...role } of roles) {
          const roleRegistrationUri = await this.actions.post(
            {
              resource: {
                type: 'interop:RoleRegistration',
                'interop:registeredBy': groupWebId,
                'interop:registeredWith': authAgentUri,
                'interop:registeredAt': new Date().toISOString(),
                'interop:updatedAt': new Date().toISOString(),
                'interop:isSystemRole': true,
                'interop:hasMember': ownerWebId,
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
        }
      }
    },

    getUri: {
      async handler(ctx) {
        const { groupWebId, role } = ctx.params;
        const containerUri = await this.actions.getContainerUri({ webId: groupWebId }, { parentCtx: ctx });
        return urlJoin(containerUri, role);
      }
    },

    listForGroup: {
      async handler(ctx) {
        const { groupWebId } = ctx.params;
        const container = await this.actions.list({ webId: groupWebId }, { parentCtx: ctx });
        return arrayOf(container['ldp:contains']);
      }
    },

    listForAgent: {
      async handler(ctx) {
        const { groupWebId, agentUri } = ctx.params;
        const roles = await this.actions.listForGroup({ groupWebId }, { parentCtx: ctx });
        return roles.filter((role: any) => arrayOf(role['interop:hasMember']).includes(agentUri));
      }
    },

    hasRole: {
      async handler(ctx) {
        const { groupWebId, agentUri, role } = ctx.params;
        const roleRegistration = await this.actions.get(
          { resourceUri: await this.actions.getUri({ groupWebId, role }, { parentCtx: ctx }), webId: 'system' },
          { parentCtx: ctx }
        );
        return arrayOf(roleRegistration['interop:hasMember']).includes(agentUri);
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
