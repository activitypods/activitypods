import path from 'node:path';
import urlJoin from 'url-join';
// @ts-expect-error TS(2614): Module '"moleculer-web"' has no exported member 'E... Remove this comment to see the full error message
import { Errors as E } from 'moleculer-web';
import { arrayOf, getId, getSlugFromUri } from '@semapps/ldp';
import { ACTIVITY_TYPES, ACTOR_TYPES, ActivitiesHandlerMixin } from '@semapps/activitypub';
import { throw403, throw404 } from '@semapps/middlewares';
import * as CONFIG from '../config/config.ts';
import {
  INVITE_TO_GROUP,
  ACCEPT_GROUP_INVITATION,
  REJECT_GROUP_INVITATION,
  UNDO_GROUP_INVITATION,
  REMOVE_GROUP_MEMBER,
  LEAVE_GROUP,
  ACCEPT_LEAVE_GROUP
} from '../config/patterns.ts';
import { INVITE_TO_GROUP_MAPPING, REMOVED_FROM_GROUP_MAPPING } from '../config/mappings.ts';
import { ServiceSchema } from 'moleculer';

const GroupsService = {
  name: 'groups' as const,
  // @ts-expect-error TS(2322): Type '{ dependencies: string[]; started(this: Service<ServiceSettingSchema>): Promise<void>; ... Remove this comment to see the full error message
  mixins: [ActivitiesHandlerMixin],
  settings: {
    groupsCollectionOptions: {
      path: '/groups',
      attachToTypes: [ACTOR_TYPES.PERSON],
      attachPredicate: 'http://activitypods.org/ns/core#groups',
      ordered: false,
      dereferenceItems: false,
      permissions: {} // This collection is only visible by the Pod owner
    },
    groupInvitationsCollectionOptions: {
      path: '/group-invitations',
      attachToTypes: [ACTOR_TYPES.PERSON],
      attachPredicate: 'http://activitypods.org/ns/core#groupInvitations',
      ordered: false,
      dereferenceItems: true,
      permissions: {}
    },
    // Invitations sent by a group and not answered yet
    pendingInvitationsCollectionOptions: {
      path: '/invitations',
      attachToTypes: [ACTOR_TYPES.GROUP, ACTOR_TYPES.ORGANIZATION],
      attachPredicate: 'http://activitypods.org/ns/core#invitations',
      ordered: false,
      dereferenceItems: true,
      permissions: {}
    }
  },
  dependencies: ['api', 'ldp', 'activitypub.collections-registry'],
  async started() {
    await this.broker.call('activitypub.collections-registry.register', this.settings.groupsCollectionOptions);
    await this.broker.call(
      'activitypub.collections-registry.register',
      this.settings.groupInvitationsCollectionOptions
    );

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
          'GET /:username/me': 'groups.getOwnRoles',
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
        await this.updateMemberGroups(ctx, ownerWebId, groupWebId, true);

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

    getOwnRoles: {
      async handler(ctx) {
        const groupWebId = await this.getGroupWebId(ctx, ctx.params.username);
        const webId = ctx.meta.impersonatedUser || ctx.meta.webId;

        const roles = await ctx.call('role-registrations.listForAgent', { groupWebId, agentUri: webId });
        if (roles.length === 0) throw403('You are not a member of this group');

        return {
          roles: roles.map((role: any) => ({ id: getSlugFromUri(getId(role)), label: role['skos:prefLabel'] })),
          specialRights: [...new Set(roles.flatMap((role: any) => arrayOf(role['interop:hasSpecialRight'])))]
        };
      }
    },

    listMembers: {
      async handler(ctx) {
        const groupWebId = await this.getGroupWebId(ctx, ctx.params.username);
        await this.checkSpecialRight(ctx, groupWebId, 'interop:ReadMembers');

        const members = await ctx.call('role-registrations.getMembers', { groupWebId });

        const { collectionUri, meta } = await this.getCollection(
          ctx,
          groupWebId,
          this.settings.pendingInvitationsCollectionOptions
        );
        const pending = await ctx.call('activitypub.collection.get', { resourceUri: collectionUri }, { meta });
        const invited = arrayOf(pending?.items)
          .flatMap((invite: any) => arrayOf(invite.target))
          .filter((webId: string) => !members[webId]);

        return [
          ...Object.entries(members).map(([webId, memberRoles]) => ({ webId, roles: memberRoles })),
          ...[...new Set(invited)].map(webId => ({ webId, roles: [], invited: true }))
        ];
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

        await this.invite(ctx, groupWebId, memberUri);
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
        await this.cancelInvitation(ctx, groupWebId, memberUri);
        await this.expel(ctx, groupWebId, memberUri);
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

        if (role === 'member') {
          await this.invite(ctx, groupWebId, memberUri);
          return;
        }

        if (!(await this.isMember(ctx, groupWebId, memberUri)))
          throw new E.BadRequestError('Only members of the group can be given a role');
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
          await this.expel(ctx, groupWebId, memberUri);
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
    inviteToGroup: {
      match: INVITE_TO_GROUP,
      async onReceive(this: any, ctx: any, activity: any, recipientUri: any) {
        if (!arrayOf(activity.target).includes(recipientUri)) return;

        const { collectionUri, meta } = await this.getCollection(
          ctx,
          recipientUri,
          this.settings.groupInvitationsCollectionOptions
        );
        await ctx.call('activitypub.collection.add', { collectionUri, item: activity.id }, { meta });

        await ctx.call('mail-notifications.notify', {
          template: INVITE_TO_GROUP_MAPPING,
          recipientUri,
          activity,
          context: activity.id
        });
      }
    },
    acceptGroupInvitation: {
      match: ACCEPT_GROUP_INVITATION,
      async onEmit(this: any, ctx: any, activity: any, emitterUri: any) {
        const invite = activity.object;
        await this.removeGroupInvitation(ctx, emitterUri, invite.id);
        await this.updateMemberGroups(ctx, emitterUri, invite.actor, true);
      },
      async onReceive(this: any, ctx: any, activity: any, recipientUri: any) {
        if (!(await this.consumePendingInvitation(ctx, activity, recipientUri))) return;
        await this.addToGroup(ctx, recipientUri, activity.actor);
      }
    },
    rejectGroupInvitation: {
      match: REJECT_GROUP_INVITATION,
      async onEmit(this: any, ctx: any, activity: any, emitterUri: any) {
        await this.removeGroupInvitation(ctx, emitterUri, activity.object.id);
      },
      async onReceive(this: any, ctx: any, activity: any, recipientUri: any) {
        await this.consumePendingInvitation(ctx, activity, recipientUri);
      }
    },
    groupInvitationCancelled: {
      match: UNDO_GROUP_INVITATION,
      async onReceive(this: any, ctx: any, activity: any, recipientUri: any) {
        const invite = activity.object;
        if (invite.actor !== activity.actor || !arrayOf(invite.target).includes(recipientUri)) return;
        await this.removeGroupInvitation(ctx, recipientUri, invite.id);
      }
    },
    removedFromGroup: {
      match: REMOVE_GROUP_MEMBER,
      async onReceive(this: any, ctx: any, activity: any, recipientUri: any) {
        if (activity.object.id !== recipientUri || getId(activity.origin) !== activity.actor) return;
        await this.updateMemberGroups(ctx, recipientUri, activity.actor, false);
        await ctx.call('mail-notifications.notify', {
          template: REMOVED_FROM_GROUP_MAPPING,
          recipientUri,
          activity
        });
      }
    },
    leaveGroup: {
      match: LEAVE_GROUP,
      async onReceive(this: any, ctx: any, activity: any, recipientUri: any) {
        const groupWebId = typeof activity.object === 'string' ? activity.object : activity.object?.id;
        if (groupWebId !== recipientUri) return;
        const account = await ctx.call('auth.account.findByWebId', { webId: groupWebId });
        if (!account?.group) return;

        const memberUri = activity.actor;
        const ownersUri = await this.getRoleUri(ctx, groupWebId, 'owner');
        const owners = await ctx.call('role-registrations.get', { resourceUri: ownersUri, webId: 'system' });
        const ownersUris = arrayOf(owners['interop:hasMember']);
        if (ownersUris.includes(memberUri)) {
          if (ownersUris.length === 1) {
            await this.postAsGroup(ctx, groupWebId, {
              type: ACTIVITY_TYPES.REJECT,
              object: activity.id,
              to: memberUri
            });
            return;
          }
          await ctx.call('role-registrations.removeMember', { roleRegistrationUri: ownersUri, agentUri: memberUri });
          await this.setOwnerRights(ctx, groupWebId, memberUri, false);
        }

        await this.removeFromGroup(ctx, groupWebId, memberUri);
        await this.postAsGroup(ctx, groupWebId, { type: ACTIVITY_TYPES.ACCEPT, object: activity.id, to: memberUri });
      }
    },
    leaveAccepted: {
      match: ACCEPT_LEAVE_GROUP,
      async onReceive(this: any, ctx: any, activity: any, recipientUri: any) {
        const leave = activity.object;
        if (leave.actor !== recipientUri || leave.object !== activity.actor) return;
        await this.updateMemberGroups(ctx, recipientUri, activity.actor, false);
      }
    }
  },
  methods: {
    async getCollection(ctx, actorUri, collection) {
      // The context may come from another actor (and its dataset)
      const account = await ctx.call('auth.account.findByWebId', { webId: actorUri });
      const meta = { dataset: account.username, webId: 'system' };

      // Created on the fly, as Pods created before groups do not have these collections
      const collectionUri = await ctx.call(
        'activitypub.collections-registry.createAndAttachCollection',
        { objectUri: actorUri, collection, webId: 'system' },
        { meta }
      );
      return { collectionUri, meta };
    },
    async updateMemberGroups(ctx, memberUri, groupWebId, isMember) {
      const { collectionUri, meta } = await this.getCollection(ctx, memberUri, this.settings.groupsCollectionOptions);
      await ctx.call(
        isMember ? 'activitypub.collection.add' : 'activitypub.collection.remove',
        { collectionUri, item: groupWebId },
        { meta }
      );
    },
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
    async isMember(ctx, groupWebId, memberUri) {
      return await ctx.call('role-registrations.hasRole', {
        groupWebId,
        agentUri: memberUri,
        role: 'member',
        direct: true
      });
    },
    async invite(ctx, groupWebId, memberUri) {
      if (await this.isMember(ctx, groupWebId, memberUri)) return;

      const member = await ctx.call('activitypub.actor.get', { actorUri: memberUri });
      if (!member || !arrayOf(member.type || member['@type']).includes('foaf:Person'))
        throw new E.BadRequestError('Only persons can be invited to a group');

      const { collectionUri, meta } = await this.getCollection(
        ctx,
        groupWebId,
        this.settings.pendingInvitationsCollectionOptions
      );
      const pending = await ctx.call('activitypub.collection.get', { resourceUri: collectionUri }, { meta });
      if (arrayOf(pending?.items).some((invite: any) => arrayOf(invite.target).includes(memberUri))) return;

      const invite = await this.postAsGroup(ctx, groupWebId, {
        type: ACTIVITY_TYPES.INVITE,
        object: groupWebId,
        target: memberUri,
        to: memberUri
      });
      await ctx.call('activitypub.collection.add', { collectionUri, item: invite.id }, { meta });
    },
    async cancelInvitation(ctx, groupWebId, memberUri) {
      const { collectionUri, meta } = await this.getCollection(
        ctx,
        groupWebId,
        this.settings.pendingInvitationsCollectionOptions
      );
      const pending = await ctx.call('activitypub.collection.get', { resourceUri: collectionUri }, { meta });
      for (const invite of arrayOf(pending?.items)) {
        if (!arrayOf(invite.target).includes(memberUri)) continue;
        await ctx.call('activitypub.collection.remove', { collectionUri, item: invite.id }, { meta });
        await this.postAsGroup(ctx, groupWebId, { type: ACTIVITY_TYPES.UNDO, object: invite.id, to: memberUri });
      }
    },
    async consumePendingInvitation(ctx, answer, groupWebId) {
      const invite = answer.object;
      if (invite.actor !== groupWebId || !arrayOf(invite.target).includes(answer.actor)) return false;

      const { collectionUri, meta } = await this.getCollection(
        ctx,
        groupWebId,
        this.settings.pendingInvitationsCollectionOptions
      );
      const isPending = await ctx.call(
        'activitypub.collection.includes',
        { collectionUri, itemUri: invite.id },
        { meta }
      );
      if (!isPending) return false;

      await ctx.call('activitypub.collection.remove', { collectionUri, item: invite.id }, { meta });
      return true;
    },
    async removeGroupInvitation(ctx, memberUri, inviteUri) {
      const { collectionUri, meta } = await this.getCollection(
        ctx,
        memberUri,
        this.settings.groupInvitationsCollectionOptions
      );
      await ctx.call('activitypub.collection.remove', { collectionUri, item: inviteUri }, { meta });
    },
    async addToGroup(ctx, groupWebId, memberUri) {
      if (await this.isMember(ctx, groupWebId, memberUri)) return;

      await ctx.call('role-registrations.addMember', {
        roleRegistrationUri: await this.getRoleUri(ctx, groupWebId, 'member'),
        agentUri: memberUri
      });

      await ctx.call('social-agent-registrations.createOrUpdate', { agentUri: memberUri, podOwner: groupWebId });
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
    },
    async expel(ctx, groupWebId, memberUri) {
      if (!(await this.isMember(ctx, groupWebId, memberUri))) return;
      await this.removeFromGroup(ctx, groupWebId, memberUri);
      await this.postAsGroup(ctx, groupWebId, {
        type: ACTIVITY_TYPES.REMOVE,
        object: memberUri,
        origin: groupWebId,
        to: memberUri
      });
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
    async postAsGroup(ctx, groupWebId, activity) {
      const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
        actorUri: groupWebId,
        predicate: 'outbox'
      });
      return await ctx.call(
        'activitypub.outbox.post',
        { collectionUri: outboxUri, actor: groupWebId, ...activity },
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
