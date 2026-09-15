import urlJoin from 'url-join';
import rdf from '@rdfjs/data-model';
import { ControlledContainerMixin } from '@semapps/ldp';
import { OBJECT_TYPES, AS_PREFIX } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';
import { fuzzGeo } from '../../utils.ts';

// Radius (in meters) of the area in which the home position shown on the profile is randomly shifted
const HOME_LOCATION_FUZZ_RADIUS = 1000;

const ProfilesProfileSchema = {
  name: 'profiles.profile' as const,
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
    'auth.registered': {
      async handler(ctx) {
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type 'Optionali... Remove this comment to see the full error message
        const { webId, profileData } = ctx.params;
        const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });

        await this.actions.waitForContainerCreation({ containerUri }, { parentCtx: ctx });

        // @ts-expect-error TS(2339): Property 'actions' does not exist on type 'Service... Remove this comment to see the full error message
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
          triplesToAdd: [rdf.quad(rdf.namedNode(webId), rdf.namedNode(AS_PREFIX + 'url'), rdf.namedNode(profileUri))],
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
    }
  },
  hooks: {
    before: {
      async put(ctx) {
        // Update vcard:hasGeo if vcard:hasAddress is set
        if (ctx.params.resource['vcard:hasAddress']) {
          const webId = ctx.params.webId || ctx.meta.webId;
          const location = await ctx.call('profiles.location.get', {
            resourceUri: ctx.params.resource['vcard:hasAddress'],
            webId
          });
          const exactGeo = location?.['vcard:hasAddress']?.['vcard:hasGeo'];
          if (exactGeo) {
            // The profile is visible by all contacts, while the location is only visible to those it was shared with.
            // So we only store an approximate position on the profile, to avoid leaking the exact home address.
            const oldData = await ctx.call('profiles.profile.get', {
              resourceUri: ctx.params.resource.id || ctx.params.resource['@id'],
              accept: MIME_TYPES.JSON,
              webId
            });
            const oldGeo = oldData['vcard:hasGeo'];
            if (oldData['vcard:hasAddress'] === ctx.params.resource['vcard:hasAddress'] && oldGeo) {
              // Keep the same approximate position as long as the home address does not change,
              // otherwise the exact position could be inferred by averaging successive values
              ctx.params.resource['vcard:hasGeo'] = {
                'vcard:latitude': oldGeo['vcard:latitude'],
                'vcard:longitude': oldGeo['vcard:longitude']
              };
            } else {
              ctx.params.resource['vcard:hasGeo'] = fuzzGeo(exactGeo, HOME_LOCATION_FUZZ_RADIUS);
            }
          } else {
            // @ts-expect-error TS(2339): Property 'warn' does not exist on type 'string | A... Remove this comment to see the full error message
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
} satisfies ServiceSchema;

export default ProfilesProfileSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ProfilesProfileSchema.name]: typeof ProfilesProfileSchema;
    }
  }
}
