// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { ControlledContainerMixin } from '@semapps/ldp';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';

export default {
  name: 'profiles.location',
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
    async getHomeLocation(ctx: any) {
      const { webId } = ctx.params;

      const results = await ctx.call('triplestore.query', {
        query: `
          PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
          PREFIX as: <https://www.w3.org/ns/activitystreams#>
          SELECT ?homeLocation
          WHERE {
            <${webId}> as:url ?profile .
            ?profile vcard:hasAddress ?homeLocation .
          }
        `,
        accept: MIME_TYPES.JSON,
        webId
      });

      return results.length > 0 ? results[0].homeLocation.value : null;
    },
    async clearHomeLocation(ctx: any) {
      const { webId } = ctx.params;
      await ctx.call('triplestore.update', {
        query: `
          PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
          PREFIX as: <https://www.w3.org/ns/activitystreams#>
          DELETE {
            ?profile vcard:hasAddress ?homeLocation .
            ?hasGeo vcard:latitude ?latitude .
            ?hasGeo vcard:longitude ?longitude .
            ?profile vcard:hasGeo ?hasGeo .
          }
          WHERE {
            <${webId}> as:url ?profile .
            ?profile vcard:hasAddress ?homeLocation .
            ?profile vcard:hasGeo ?hasGeo .
            ?hasGeo vcard:latitude ?latitude .
            ?hasGeo vcard:longitude ?longitude .
          }
        `,
        webId
      });
    }
  },
  hooks: {
    after: {
      async delete(ctx: any, res: any) {
        // If the deleted location is the home location of the current user, clear it from profile
        // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ delet... Remove this comment to see the full error message
        const homeLocation = await this.actions.getHomeLocation({ webId: res.webId }, { parentCtx: ctx });
        if (homeLocation === res.resourceUri) {
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ delet... Remove this comment to see the full error message
          await this.actions.clearHomeLocation({ webId: res.webId }, { parentCtx: ctx });
        }
        return res;
      }
    }
  }
};
