const path = require('node:path');
const urlJoin = require('url-join');
const { Errors: E } = require('moleculer-web');
const { MIME_TYPES } = require('@semapps/mime-types');
const { arrayOf } = require('@semapps/ldp');
const { throw403, throw404 } = require('@semapps/middlewares');
const CONFIG = require('../config/config');

const GroupsService = {
  name: 'groups',
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
          'POST /:username/claimGroup': 'groups.claim'
        }
      }
    });
  },
  actions: {
    /**
     * Create a new group
     * @param id Unique identifier for the group
     * @param type
     */
    async create(ctx) {
      const { id, type } = ctx.params;
      const ownerWebId = ctx.meta.webId;
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
        group: true,
        owner: ownerWebId
      });

      // Create storage
      const storageUrl = await ctx.call('solid-storage.create', { username: id });

      // Create containers
      const registeredContainers = await ctx.call('ldp.registry.list');
      for (const { path, permissions } of Object.values(registeredContainers)) {
        await ctx.call('ldp.container.createAndAttach', {
          containerUri: urlJoin(storageUrl, path),
          permissions, // Used by the WebAclMiddleware
          webId: ownerWebId
        });
      }

      // Create WebID
      await await ctx.call('webid.create', {
        resource: {
          '@id': groupWebId,
          '@type': type === 'foaf:Organization' ? ['foaf:Organization', 'as:Organization'] : ['foaf:Group', 'as:Group'],
          'foaf:nick': id,
          'pim:storage': storageUrl
        },
        contentType: MIME_TYPES.JSON,
        webId: 'system'
      });

      // Give full rights to the group owner on the group WebId
      await ctx.call('webacl.resource.addRights', {
        resourceUri: groupWebId,
        additionalRights: {
          anon: {
            read: true
          },
          user: {
            uri: ownerWebId,
            read: true,
            write: true,
            control: true
          }
        },
        webId: 'system'
      });

      // Give full rights to the group owner on the group storage
      await ctx.call('webacl.resource.addRights', {
        resourceUri: storageUrl,
        additionalRights: {
          user: {
            uri: ownerWebId,
            read: true,
            write: true,
            control: true
          },
          default: {
            user: {
              uri: ownerWebId,
              read: true,
              write: true,
              control: true
            }
          }
        },
        webId: 'system'
      });

      // We need to set the Location twice or we get a Moleculer warning
      ctx.meta.$responseHeaders = {
        Location: groupWebId,
        'Content-Length': 0
      };
      ctx.meta.$location = groupWebId;
      ctx.meta.$statusCode = 201;
    },
    async list(ctx) {
      const ownerWebId = ctx.meta.webId;
      const ownerAccount = await ctx.call('auth.account.findByWebId', { webId: ownerWebId });
      return arrayOf(ownerAccount.owns);
    },
    async claim(ctx) {
      const { username, groupWebId } = ctx.params;
      const webId = ctx.meta.webId;

      const account = await ctx.call('auth.account.findByUsername', { username });
      if (!account) throw404('Actor not found');

      if (!webId || (webId !== 'system' && webId !== account.webId)) {
        throw403('You are not allowed to claim a group with this actor.');
      }

      // Attach group to account
      await ctx.call('auth.account.update', {
        id: account['@id'],
        owns: account.owns ? [...arrayOf(account.owns), groupWebId] : groupWebId
      });
    },
    async undoClaim(ctx) {
      const { username, groupWebId } = ctx.params;
      const webId = ctx.meta.webId;

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
};

module.exports = GroupsService;
