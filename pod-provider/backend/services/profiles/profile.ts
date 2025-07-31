// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { triple, namedNode } from '@rdfjs/data-model';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { ControlledContainerMixin } from '@semapps/ldp';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { OBJECT_TYPES, AS_PREFIX } from '@semapps/activitypub';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';

export default {
  name: 'profiles.profile',
  mixins: [ControlledContainerMixin],
  settings: {
    // ControlledContainerMixin settings
    path: '/vcard/individual',
    acceptedTypes: ['vcard:Individual', OBJECT_TYPES.PROFILE],
    shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Profile'),
    permissions: {},
    newResourcesPermissions: {},
    typeIndex: 'public'
  },
  dependencies: ['activitypub', 'webacl'],
  events: {
    async 'auth.registered'(ctx: any) {
      const { webId, profileData } = ctx.params;
      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ 'auth... Remove this comment to see the full error message
      const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });

      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ 'auth... Remove this comment to see the full error message
      await this.actions.waitForContainerCreation({ containerUri }, { parentCtx: ctx });

      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ 'auth... Remove this comment to see the full error message
      const profileUri = await this.actions.post(
        {
          containerUri,
          resource: {
            '@type': ['vcard:Individual', OBJECT_TYPES.PROFILE],
            'vcard:fn': profileData.familyName
              ? `${profileData.name} ${profileData.familyName.toUpperCase()}`
              : profileData.name,
            'vcard:given-name': profileData.name,
            'vcard:family-name': profileData.familyName,
            describes: webId
          },
          contentType: MIME_TYPES.JSON,
          webId
        },
        {
          meta: {
            skipObjectsWatcher: true // We don't want to trigger a Create action
          },
          parentCtx: ctx
        }
      );

      await ctx.call('ldp.resource.patch', {
        resourceUri: webId,
        triplesToAdd: [triple(namedNode(webId), namedNode(AS_PREFIX + 'url'), namedNode(profileUri))],
        webId
      });

      // TODO put this on the contacts app
      // Create a WebACL group for the user's contact
      const { groupUri: contactsGroupUri } = await ctx.call('webacl.group.create', {
        groupSlug: new URL(webId).pathname + '/contacts',
        webId
      });

      // Authorize this group to view the user's profile
      await ctx.call('webacl.resource.addRights', {
        resourceUri: profileUri,
        additionalRights: {
          group: {
            uri: contactsGroupUri,
            read: true
          }
        },
        webId
      });
    }
  },
  hooks: {
    before: {
      async put(ctx: any) {
        // Update vcard:hasGeo if vcard:hasAddress is set
        if (ctx.params.resource['vcard:hasAddress']) {
          const location = await ctx.call('profiles.location.get', {
            resourceUri: ctx.params.resource['vcard:hasAddress'],
            webId: ctx.params.webId
          });
          if (location && location['vcard:hasAddress'] && location['vcard:hasAddress']['vcard:hasGeo']) {
            ctx.params.resource['vcard:hasGeo'] = location['vcard:hasAddress']['vcard:hasGeo'];
          } else {
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ put(ct... Remove this comment to see the full error message
            this.logger.warn(
              `Could not fetch location ${ctx.params.resource['vcard:hasAddress']} when updating profile`
            );
          }
        } else {
          if (ctx.params.resource['vcard:hasGeo']) {
            delete ctx.params.resource['vcard:hasGeo'];
          }
        }
      }
    }
    // TODO give permissions to read home address to all contacts ?
    // The action webacl.group.getUri need to be published first
    //   after: {
    //     async put(ctx, res) {
    //       const { oldData, newData, webId } = res;
    //       if (newData['vcard:hasAddress'] !== oldData['vcard:hasAddress']) {
    //         const contactsGroupUri = await ctx.call('webacl.group.getUri', { groupSlug: new URL(webId).pathname + '/contacts' })
    //         if (newData['vcard:hasAddress']) {
    //           await ctx.call('webacl.resource.addRights', {
    //             resourceUri: newData['vcard:hasAddress'],
    //             additionalRights: {
    //               group: {
    //                 uri: contactsGroupUri,
    //                 read: true,
    //               },
    //             },
    //             webId,
    //           });
    //         }
    //         if (oldData['vcard:hasAddress']) {
    //           await ctx.call('webacl.resource.removeRights', {
    //             resourceUri: oldData['vcard:hasAddress'],
    //             rights: {
    //               group: {
    //                 uri: contactsGroupUri,
    //                 read: true,
    //               },
    //             },
    //             webId,
    //           });
    //         }
    //       }
    //       return res;
    //     }
    //   }
  }
};
