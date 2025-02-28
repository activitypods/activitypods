const path = require('path');
const urlJoin = require('url-join');
const { arrayOf } = require('@semapps/ldp');
const { ACTIVITY_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');

// TODO: See if / how we need the announces and announcers collections for objects.
//  I suppose, the idea is to keep track of who has announce rights (and who may see those).
module.exports = {
  name: 'announcer',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    authorizationsCollectionOptions: {
      path: '/authorizations', // Or capabilities?
      attachPredicate: 'http://activitypods.org/ns/core#authorization',
      ordered: false,
      dereferenceItems: false,
      permissions: {}
    }
  },
  dependencies: ['activitypub.collections-registry'],
  actions: {},
  activities: {
    offerToShare: {
      match: {
        type: ACTIVITY_TYPES.OFFER,
        object: {
          type: 'Authorization' // or `Grant` or array of that?
        }
      },
      /** Authorize a target */
      async onEmit(ctx, activity) {
        const object = await ctx.call('ldp.resource.get', {
          resourceUri: typeof activity.object.object === 'string' ? activity.object.object : activity.object.object.id,
          accept: MIME_TYPES.JSON
        });

        // TODO: This is old code

        const authorizedCollectionUri = await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
          objectUri: object.id,
          collection: this.settings.announcersCollectionOptions
        });

        await this.actions.giveRightsAfterAnnouncersCollectionCreate({ objectUri: object.id }, { parentCtx: ctx });

        // TODO:
        // Send a `Grant` or `Offer` activity to the person.

        // Add all announcers to the collection, to track who we granted the right to.
        for (let actorUri of arrayOf(activity.target)) {
          await ctx.call('activitypub.collection.add', {
            collectionUri: authorizedCollectionUri,
            item: actorUri
          });
        }
      }
    }
  }
};
