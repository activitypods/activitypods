const path = require('node:path');
const urlJoin = require('url-join');
const { Errors: E } = require('moleculer-web');
const { MIME_TYPES } = require('@semapps/mime-types');
const { arrayOf } = require('@semapps/ldp');
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
          'POST /:actorUri/claimGroup': 'groups.claim'
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

      // Create WebID
      await await ctx.call('webid.create', {
        resource: {
          '@id': groupWebId,
          '@type': type,
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
      const { actorUri, groupWebId } = ctx.params;
      const webId = ctx.meta.webId;

      if (!webId || (webId !== 'system' && webId !== actorUri)) {
        throw403('You are not allowed to claim a group with this actor.');
      }

      const ownerAccount = await ctx.call('auth.account.findByWebId', { webId });

      // Attach group to owner account
      await ctx.call('auth.account.update', {
        id: ownerAccount['@id'],
        owns: ownerAccount.owns ? [...arrayOf(ownerAccount.owns), groupWebId] : groupWebId
      });
    }
  }
};

module.exports = GroupsService;
