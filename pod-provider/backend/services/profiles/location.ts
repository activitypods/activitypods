import urlJoin from 'url-join';
import { ControlledContainerMixin } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const ProfilesLocationSchema = {
  name: 'profiles.location' as const,
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['vcard:Location'],
    shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Location'),
    excludeFromMirror: true,
    permissions: {},
    newResourcesPermissions: {},
    typeIndex: 'public'
  },
  actions: {
    getHomeLocation: {
      async handler(ctx) {
        const { webId } = ctx.params;

        const results = await ctx.call('triplestore.query', {
          query: `
            PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            SELECT ?homeLocation
            WHERE {
              GRAPH <${webId}> {
                <${webId}> as:url ?profile .
              }
              GRAPH ?profile {
                ?profile vcard:hasAddress ?homeLocation .
              }
            }
          `,
          accept: MIME_TYPES.JSON,
          webId
        });

        // @ts-expect-error TS(2339): Property 'length' does not exist on type 'never'.
        return results.length > 0 ? results[0].homeLocation.value : null;
      }
    },

    clearHomeLocation: {
      async handler(ctx) {
        const { webId } = ctx.params;
        await ctx.call('triplestore.update', {
          query: `
            PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            DELETE {
              GRAPH ?profile {
                ?profile vcard:hasAddress ?homeLocation .
                ?hasGeo vcard:latitude ?latitude .
                ?hasGeo vcard:longitude ?longitude .
                ?profile vcard:hasGeo ?hasGeo .
              }
            }
            WHERE {
              GRAPH <${webId}> {
                <${webId}> as:url ?profile .
              }
              GRAPH ?profile {
                ?profile vcard:hasAddress ?homeLocation .
                ?profile vcard:hasGeo ?hasGeo .
                ?hasGeo vcard:latitude ?latitude .
                ?hasGeo vcard:longitude ?longitude .
              }
            }
          `,
          webId
        });
      }
    }
  },
  hooks: {
    after: {
      async delete(ctx, res) {
        // If the deleted location is the home location of the current user, clear it from profile
        // @ts-expect-error TS(2339): Property 'getHomeLocation' does not exist on type ... Remove this comment to see the full error message
        const homeLocation = await this.actions.getHomeLocation({ webId: res.webId }, { parentCtx: ctx });
        if (homeLocation === res.resourceUri) {
          // @ts-expect-error TS(2339): Property 'clearHomeLocation' does not exist on typ... Remove this comment to see the full error message
          await this.actions.clearHomeLocation({ webId: res.webId }, { parentCtx: ctx });
        }
        return res;
      }
    }
  }
} satisfies ServiceSchema;

export default ProfilesLocationSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ProfilesLocationSchema.name]: typeof ProfilesLocationSchema;
    }
  }
}
