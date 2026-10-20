import path from 'node:path';
import urlJoin from 'url-join';
// @ts-expect-error TS(2614): Module '"moleculer-web"' has no exported member 'E... Remove this comment to see the full error message
import { Errors as E } from 'moleculer-web';
import { arrayOf, getId, getSlugFromUri } from '@semapps/ldp';
import { ACTIVITY_TYPES, ActivitiesHandlerMixin } from '@semapps/activitypub';
import { throw403, throw404 } from '@semapps/middlewares';
import * as CONFIG from '../config/config.ts';
import { ADD_GROUP_MEMBER } from '../config/patterns.ts';
import { ADD_GROUP_MEMBER_MAPPING } from '../config/mappings.ts';
import { ServiceSchema } from 'moleculer';

const GroupsService = {
  name: 'groups' as const,
  // @ts-expect-error TS(2322): Type '{ dependencies: string[]; started(this: Service<ServiceSettingSchema>): Promise<void>; ... Remove this comment to see the full error message
  mixins: [ActivitiesHandlerMixin],
  dependencies: ['api', 'ldp'],
  async started() {
    const basePath = await this.broker.call('ldp.getBasePath');
    this.broker.call('api.addRoute', {
      route: {
        name: 'groups',
        path: path.join(basePath, '/.account'),
        authentication: true,
        aliases: {
          'POST /groups': 'groups.create',
          'GET /groups': 'groups.list',
          'POST /:username/claimGroup': 'groups.claim',
          'GET /:username/members': 'groups.listMembers',
          'POST /:username/members': 'groups.addMember',
          'DELETE /:username/members': 'groups.removeMember',
          'GET /:username/roles': 'groups.listRoles',
          'POST /:username/roles': 'groups.createRole',
          'PUT /:username/roles/:role': 'groups.updateRole',
          'DELETE /:username/roles/:role': 'groups.deleteRole',
          'POST /:username/roles/:role/members': 'groups.addRoleMember',
          'DELETE /:username/roles/:role/members': 'groups.removeRoleMember'
        },
        bodyParsers: { json: true }
      }
    });
  },
  actions: {
    create: {
      /**
       * Create a new group
       * @param id Unique identifier for the group
       * @param type
       */
      async handler(ctx) {
        const { id, type } = ctx.params;
        const ownerWebId = ctx.meta.impersonatedUser || ctx.meta.webId;
        const groupWebId = urlJoin(CONFIG.BASE_URL, id);

        if (!['foaf:Organization', 'foaf:Group'].includes(type))
          throw new E.BadRequestError('Type must be foaf:Organization or foaf:Group');

        // Ensure the owner is a valid WebID
        const owner = await ctx.call('activitypub.actor.get', { actorUri: ownerWebId });
        if (!owner || !arrayOf(owner.type || owner['@type']).includes('foaf:Person')) throw new E.ForbiddenError();

        // Create account
        await ctx.call('auth.account.create', {
          username: id,
          webId: groupWebId,
          group: true
        });

        // Create WebID and storage
        await ctx.call('webid.createWebId', {
          nick: id,
          '@type': type === 'foaf:Organization' ? ['foaf:Organization', 'as:Organization'] : ['foaf:Group', 'as:Group']
        });

        await this.setOwnerRights(ctx, groupWebId, ownerWebId, true);

        await ctx.call('role-registrations.initializeForGroup', { groupWebId, ownerWebId });

        // We need to set the Location twice or we get a Moleculer warning
        ctx.meta.$responseHeaders = {
          Location: groupWebId,
          'Content-Length': 0
        };
        ctx.meta.$location = groupWebId;
        ctx.meta.$statusCode = 201;
      }
    },

    list: {
      async handler(ctx) {
        const ownerWebId = ctx.meta.impersonatedUser || ctx.meta.webId;
        const ownerAccount = await ctx.call('auth.account.findByWebId', { webId: ownerWebId });
        if (!ownerAccount) return [];
        return arrayOf(ownerAccount.owns);
      }
    },

    listMembers: {
      async handler(ctx) {
        const groupWebId = await this.getGroupWebId(ctx, ctx.params.username);
        await this.checkSpecialRight(ctx, groupWebId, 'interop:ReadMembers');

        const members = await ctx.call('role-registrations.getMembers', { groupWebId });
        return Object.entries(members).map(([webId, memberRoles]) => ({ webId, roles: memberRoles }));
      }
    },

    listRoles: {
      async handler(ctx) {
        const groupWebId = await this.getGroupWebId(ctx, ctx.params.username);
        await this.checkSpecialRight(ctx, groupWebId, 'interop:ReadMembers');

        const roles = await ctx.call('role-registrations.listForGroup', { groupWebId });
        return roles.map((role: any) => ({
          id: getSlugFromUri(getId(role)),
          label: role['skos:prefLabel'],
          isDefaultRole: role['interop:isDefaultRole'] === true,
          isSystemRole: role['interop:isSystemRole'] === true,
          extendsRoles: arrayOf(role['interop:extendsRole']).map(uri => getSlugFromUri(uri)),
          specialRights: arrayOf(role['interop:hasSpecialRight'])
        }));
      }
    },

    createRole: {
      params: {
        username: { type: 'string' },
        label: { type: 'string' },
        extendsRoles: { type: 'array', items: 'string', optional: true },
        specialRights: { type: 'array', items: 'string', optional: true }
      },
      async handler(ctx) {
        const { username, ...params } = ctx.params;
        const groupWebId = await this.getGroupWebId(ctx, username);
        await this.checkSpecialRight(ctx, groupWebId, 'interop:ManageRoles');

        const role = await this.buildRole(ctx, groupWebId, params);
        const roleRegistrationUri = await ctx.call('role-registrations.createRole', {
          groupWebId,
          slug: params.label,
          role
        });

        return { id: getSlugFromUri(roleRegistrationUri) };
      }
    },

    updateRole: {
      params: {
        username: { type: 'string' },
        role: { type: 'string' },
        label: { type: 'string' },
        extendsRoles: { type: 'array', items: 'string', optional: true },
        specialRights: { type: 'array', items: 'string', optional: true }
      },
      async handler(ctx) {
        const { username, role: slug, ...params } = ctx.params;
        const groupWebId = await this.getGroupWebId(ctx, username);
        await this.checkSpecialRight(ctx, groupWebId, 'interop:ManageRoles');

        const resourceUri = await this.getEditableRoleUri(ctx, groupWebId, slug);
        const role = await this.buildRole(ctx, groupWebId, params, resourceUri);
        await ctx.call('role-registrations.updateRole', { resourceUri, role });
      }
    },

    deleteRole: {
      params: {
        username: { type: 'string' },
        role: { type: 'string' }
      },
      async handler(ctx) {
        const { username, role: slug } = ctx.params;
        const groupWebId = await this.getGroupWebId(ctx, username);
        await this.checkSpecialRight(ctx, groupWebId, 'interop:ManageRoles');

        const resourceUri = await this.getEditableRoleUri(ctx, groupWebId, slug);
        await ctx.call('role-registrations.deleteRole', { groupWebId, resourceUri });
      }
    },

    addMember: {
      params: {
        username: { type: 'string' },
        memberUri: { type: 'string' }
      },
      async handler(ctx) {
        const { username, memberUri } = ctx.params;
        const groupWebId = await this.getGroupWebId(ctx, username);
        await this.checkSpecialRight(ctx, groupWebId, 'interop:ManageMembers');

        await this.addToGroup(ctx, groupWebId, memberUri);
      }
    },

    removeMember: {
      params: {
        username: { type: 'string' },
        memberUri: { type: 'string' }
      },
      async handler(ctx) {
        const { username, memberUri } = ctx.params;
        const groupWebId = await this.getGroupWebId(ctx, username);
        await this.checkSpecialRight(ctx, groupWebId, 'interop:ManageMembers');

        await this.removeOwner(ctx, groupWebId, memberUri);
        await this.removeFromGroup(ctx, groupWebId, memberUri);
      }
    },

    addRoleMember: {
      params: {
        username: { type: 'string' },
        role: { type: 'string' },
        memberUri: { type: 'string' }
      },
      async handler(ctx) {
        const { username, role, memberUri } = ctx.params;
        const groupWebId = await this.getGroupWebId(ctx, username);
        await this.checkSpecialRight(ctx, groupWebId, 'interop:ManageRoles');

        if (role === 'owner') await this.checkOwner(ctx, groupWebId);
        const roleRegistrationUri = await this.getRoleUri(ctx, groupWebId, role);

        await this.addToGroup(ctx, groupWebId, memberUri);
        if (role === 'member') return;

        if (await ctx.call('role-registrations.hasRole', { groupWebId, agentUri: memberUri, role, direct: true }))
          return;

        await ctx.call('role-registrations.addMember', { roleRegistrationUri, agentUri: memberUri });
        if (role === 'owner') await this.setOwnerRights(ctx, groupWebId, memberUri, true);
      }
    },

    removeRoleMember: {
      params: {
        username: { type: 'string' },
        role: { type: 'string' },
        memberUri: { type: 'string' }
      },
      async handler(ctx) {
        const { username, role, memberUri } = ctx.params;
        const groupWebId = await this.getGroupWebId(ctx, username);
        await this.checkSpecialRight(ctx, groupWebId, 'interop:ManageRoles');

        if (role === 'owner') {
          await this.removeOwner(ctx, groupWebId, memberUri);
        } else if (role === 'member') {
          await this.removeOwner(ctx, groupWebId, memberUri);
          await this.removeFromGroup(ctx, groupWebId, memberUri);
        } else {
          const roleRegistrationUri = await this.getRoleUri(ctx, groupWebId, role);
          await ctx.call('role-registrations.removeMember', { roleRegistrationUri, agentUri: memberUri });
        }
      }
    },

    claim: {
      async handler(ctx) {
        const { username, groupWebId } = ctx.params;
        const webId = ctx.meta.impersonatedUser || ctx.meta.webId;

        const account = await ctx.call('auth.account.findByUsername', { username });
        if (!account) throw404('Actor not found');

        if (!webId || (webId !== 'system' && webId !== account.webId)) {
          throw403('You are not allowed to claim a group with this actor.');
        }

        // Attach group to account
        await ctx.call('auth.account.update', {
          id: account['@id'],
          owns: [...new Set([...arrayOf(account.owns), groupWebId])]
        });
      }
    },

    undoClaim: {
      async handler(ctx) {
        const { username, groupWebId } = ctx.params;
        const webId = ctx.meta.impersonatedUser || ctx.meta.webId;

        const account = await ctx.call('auth.account.findByUsername', { username });
        if (!account) throw404('Actor not found');

        if (!webId || (webId !== 'system' && webId !== account.webId)) {
          throw403('You are not allowed to undo a group claim with this actor.');
        }

        // Detach group from account
        await ctx.call('auth.account.update', {
          id: account['@id'],
          owns: arrayOf(account.owns).filter(uri => uri !== groupWebId)
        });
      }
    }
  },
  activities: {
    addedToGroup: {
      match: ADD_GROUP_MEMBER,
      async onReceive(ctx: any, activity: any, recipientUri: any) {
        if (activity.object !== recipientUri) return;
        await ctx.call('mail-notifications.notify', {
          template: ADD_GROUP_MEMBER_MAPPING,
          recipientUri,
          activity
        });
      }
    }
  },
  methods: {
    async getGroupWebId(ctx, username) {
      const account = await ctx.call('auth.account.findByUsername', { username });
      if (!account?.group) throw404('Group not found');
      return account.webId;
    },
    async checkSpecialRight(ctx, groupWebId, right) {
      const webId = ctx.meta.impersonatedUser || ctx.meta.webId;
      if (webId === 'system') return;
      const hasRight = await ctx.call('role-registrations.hasSpecialRight', { groupWebId, agentUri: webId, right });
      if (!hasRight) throw403(`You need the ${right} right on this group`);
    },
    async checkOwner(ctx, groupWebId) {
      const webId = ctx.meta.impersonatedUser || ctx.meta.webId;
      if (webId === 'system') return;
      const isOwner = await ctx.call('role-registrations.hasRole', { groupWebId, agentUri: webId, role: 'owner' });
      if (!isOwner) throw403('Only owners can manage the Owner role');
    },
    async getEditableRoleUri(ctx, groupWebId, role) {
      const resourceUri = await this.getRoleUri(ctx, groupWebId, role);
      const roleRegistration = await ctx.call('role-registrations.get', { resourceUri, webId: 'system' });
      if (roleRegistration['interop:isSystemRole'] === true) throw403('System roles cannot be modified');
      return resourceUri;
    },
    async buildRole(ctx, groupWebId, { label, extendsRoles = [], specialRights = [] }, resourceUri?: string) {
      const roles = await ctx.call('role-registrations.listForGroup', { groupWebId });

      const extendedRolesUris = extendsRoles.map((slug: string) => {
        if (slug === 'owner') throw403('No role can extend the Owner role');
        const extendedRole = roles.find((role: any) => getSlugFromUri(getId(role)) === slug);
        if (!extendedRole) throw404(`Role ${slug} not found`);
        return getId(extendedRole);
      });

      if (resourceUri) {
        const visited = new Set<string>();
        const queue = [...extendedRolesUris];
        while (queue.length > 0) {
          const uri = queue.pop()!;
          if (uri === resourceUri) throw new E.BadRequestError('A role cannot extend itself');
          if (visited.has(uri)) continue;
          visited.add(uri);
          queue.push(...arrayOf(roles.find((role: any) => getId(role) === uri)?.['interop:extendsRole']));
        }
      }

      const webId = ctx.meta.impersonatedUser || ctx.meta.webId;
      if (webId !== 'system') {
        const agentRoles = await ctx.call('role-registrations.listForAgent', { groupWebId, agentUri: webId });
        const agentRights = agentRoles.flatMap((role: any) => arrayOf(role['interop:hasSpecialRight']));
        if (specialRights.some((right: string) => !agentRights.includes(right)))
          throw403('You cannot give special rights you do not have');
      }

      return {
        'skos:prefLabel': label,
        'interop:extendsRole': extendedRolesUris,
        'interop:hasSpecialRight': specialRights
      };
    },
    async getRoleUri(ctx, groupWebId, role) {
      const roleRegistrationUri = await ctx.call('role-registrations.getUri', { groupWebId, role });
      if (!roleRegistrationUri) throw404(`Role ${role} not found`);
      return roleRegistrationUri;
    },
    async addToGroup(ctx, groupWebId, memberUri) {
      if (
        await ctx.call('role-registrations.hasRole', { groupWebId, agentUri: memberUri, role: 'member', direct: true })
      )
        return;

      const member = await ctx.call('activitypub.actor.get', { actorUri: memberUri });
      if (!member || !arrayOf(member.type || member['@type']).includes('foaf:Person'))
        throw new E.BadRequestError('Only persons can be added to a group');

      await ctx.call('role-registrations.addMember', {
        roleRegistrationUri: await this.getRoleUri(ctx, groupWebId, 'member'),
        agentUri: memberUri
      });

      await ctx.call('social-agent-registrations.createOrUpdate', { agentUri: memberUri, podOwner: groupWebId });

      await this.notifyMember(ctx, groupWebId, memberUri, ACTIVITY_TYPES.ADD);
    },
    async removeFromGroup(ctx, groupWebId, memberUri) {
      const roles = await ctx.call('role-registrations.listForAgent', {
        groupWebId,
        agentUri: memberUri,
        direct: true
      });
      if (roles.length === 0) return;

      for (const role of roles) {
        await ctx.call('role-registrations.removeMember', {
          roleRegistrationUri: getId(role),
          agentUri: memberUri
        });
      }

      const registration = await ctx.call('social-agent-registrations.getForAgent', {
        agentUri: memberUri,
        podOwner: groupWebId
      });
      if (registration) {
        await ctx.call('social-agent-registrations.delete', {
          resourceUri: registration.id || registration['@id'],
          webId: groupWebId
        });
      }

      await this.notifyMember(ctx, groupWebId, memberUri, ACTIVITY_TYPES.REMOVE);
    },
    async removeOwner(ctx, groupWebId, ownerWebId) {
      const roleRegistrationUri = await this.getRoleUri(ctx, groupWebId, 'owner');
      const owners = await ctx.call('role-registrations.get', { resourceUri: roleRegistrationUri, webId: 'system' });
      const ownersUris = arrayOf(owners['interop:hasMember']);
      if (!ownersUris.includes(ownerWebId)) return;
      await this.checkOwner(ctx, groupWebId);
      if (ownersUris.length === 1) throw403('The last owner of a group cannot be removed');

      await ctx.call('role-registrations.removeMember', { roleRegistrationUri, agentUri: ownerWebId });
      await this.setOwnerRights(ctx, groupWebId, ownerWebId, false);
    },
    async setOwnerRights(ctx, groupWebId, ownerWebId, granted) {
      const storageUrl = await ctx.call('solid-storage.getUrl', { webId: groupWebId });
      const fullRights = { uri: ownerWebId, read: true, write: true, control: true };
      const action = granted ? 'webacl.resource.addRights' : 'webacl.resource.removeRights';
      const key = granted ? 'additionalRights' : 'rights';

      await ctx.call(action, { resourceUri: groupWebId, [key]: { user: fullRights }, webId: 'system' });
      await ctx.call(action, {
        resourceUri: storageUrl,
        [key]: { user: fullRights, default: { user: fullRights } },
        webId: 'system'
      });

      const account = await ctx.call('auth.account.findByWebId', { webId: ownerWebId });
      if (account) {
        await ctx.call(
          granted ? 'groups.claim' : 'groups.undoClaim',
          { username: account.username, groupWebId },
          { meta: { webId: 'system', impersonatedUser: undefined } }
        );
      }
    },
    async notifyMember(ctx, groupWebId, memberUri, type) {
      const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
        actorUri: groupWebId,
        predicate: 'outbox'
      });

      await ctx.call(
        'activitypub.outbox.post',
        {
          collectionUri: outboxUri,
          type,
          actor: groupWebId,
          object: memberUri,
          target: groupWebId,
          to: memberUri
        },
        { meta: { webId: groupWebId } }
      );
    }
  }
} satisfies ServiceSchema;

export default GroupsService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [GroupsService.name]: typeof GroupsService;
    }
  }
}
