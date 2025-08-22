import path from 'node:path';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(2614): Module '"moleculer-web"' has no exported member 'E... Remove this comment to see the full error message
import { Errors as E } from 'moleculer-web';
import { MIME_TYPES } from '@semapps/mime-types';
import { arrayOf } from '@semapps/ldp';
import { throw403, throw404 } from '@semapps/middlewares';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../config/config.ts';
import { ServiceSchema } from 'moleculer';

const GroupsService = {
  name: 'groups' as const,
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
    create: {
      /**
       * Create a new group
       * @param id Unique identifier for the group
       * @param type
       */
      async handler(ctx) {
        const { id, type } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const ownerWebId = ctx.meta.webId;
        const groupWebId = urlJoin(CONFIG.BASE_URL, id);

        if (!['foaf:Organization', 'foaf:Group'].includes(type))
          throw new E.BadRequestError('Type must be foaf:Organization or foaf:Group');

        // Ensure the owner is a valid WebID
        const owner = await ctx.call('activitypub.actor.get', { actorUri: ownerWebId });
        // @ts-expect-error TS(2339): Property 'type' does not exist on type 'never'.
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
        // @ts-expect-error TS(2339): Property 'path' does not exist on type 'unknown'.
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
            '@type':
              type === 'foaf:Organization' ? ['foaf:Organization', 'as:Organization'] : ['foaf:Group', 'as:Group'],
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
        // @ts-expect-error TS(2339): Property '$responseHeaders' does not exist on type... Remove this comment to see the full error message
        ctx.meta.$responseHeaders = {
          Location: groupWebId,
          'Content-Length': 0
        };
        // @ts-expect-error TS(2339): Property '$location' does not exist on type '{}'.
        ctx.meta.$location = groupWebId;
        // @ts-expect-error TS(2339): Property '$statusCode' does not exist on type '{}'... Remove this comment to see the full error message
        ctx.meta.$statusCode = 201;
      }
    },

    list: {
      async handler(ctx) {
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const ownerWebId = ctx.meta.webId;
        const ownerAccount = await ctx.call('auth.account.findByWebId', { webId: ownerWebId });
        // @ts-expect-error TS(2339): Property 'owns' does not exist on type 'never'.
        return arrayOf(ownerAccount.owns);
      }
    },

    claim: {
      async handler(ctx) {
        const { username, groupWebId } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.meta.webId;

        const account = await ctx.call('auth.account.findByUsername', { username });
        if (!account) throw404('Actor not found');

        // @ts-expect-error TS(2339): Property 'webId' does not exist on type 'never'.
        if (!webId || (webId !== 'system' && webId !== account.webId)) {
          throw403('You are not allowed to claim a group with this actor.');
        }

        // Attach group to account
        await ctx.call('auth.account.update', {
          id: account['@id'],
          // @ts-expect-error TS(2339): Property 'owns' does not exist on type 'never'.
          owns: account.owns ? [...arrayOf(account.owns), groupWebId] : groupWebId
        });
      }
    },

    undoClaim: {
      async handler(ctx) {
        const { username, groupWebId } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.meta.webId;

        const account = await ctx.call('auth.account.findByUsername', { username });
        if (!account) throw404('Actor not found');

        // @ts-expect-error TS(2339): Property 'webId' does not exist on type 'never'.
        if (!webId || (webId !== 'system' && webId !== account.webId)) {
          throw403('You are not allowed to undo a group claim with this actor.');
        }

        // Detach group from account
        await ctx.call('auth.account.update', {
          id: account['@id'],
          // @ts-expect-error TS(2339): Property 'owns' does not exist on type 'never'.
          owns: arrayOf(account.owns).filter(uri => uri !== groupWebId)
        });
      }
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
