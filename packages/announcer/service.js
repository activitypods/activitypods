const { defaultToArray } = require('@semapps/ldp');
const { ACTIVITY_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { delay, getAnnouncesGroupUri, getAnnouncersGroupUri } = require('./utils');

module.exports = {
  name: 'announcer',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    watchedTypes: [],
  },
  dependencies: ['activitypub.registry'],
  actions: {
    async watch(ctx) {
      const { types } = ctx.params;
      this.settings.watchedTypes.push(...types);

      await this.broker.call('activitypub.registry.register', {
        path: '/announces',
        attachToTypes: this.settings.watchedTypes,
        attachPredicate: 'http://activitypods.org/ns/core#announces',
        ordered: false,
        dereferenceItems: false,
      });

      await this.broker.call('activitypub.registry.register', {
        path: '/announcers',
        attachToTypes: this.settings.watchedTypes,
        attachPredicate: 'http://activitypods.org/ns/core#announcers',
        ordered: false,
        dereferenceItems: false,
      });
    },
    async giveRightsAfterCreate(ctx) {
      const { resourceUri } = ctx.params;

      const object = await ctx.call('activitypub.object.awaitCreateComplete', {
        objectUri: resourceUri,
        predicates: ['dc:creator', 'dc:modified', 'dc:created', 'apods:announces', 'apods:announcers'],
      });

      const creator = await ctx.call('activitypub.actor.get', { actorUri: object['dc:creator'] });

      // Add the creator to the list of announces and announcers
      await ctx.call('activitypub.collection.attach', {
        collectionUri: object['apods:announces'],
        item: creator.id,
      });
      await ctx.call('activitypub.collection.attach', {
        collectionUri: object['apods:announcers'],
        item: creator.id,
      });

      const announcesGroupUri = getAnnouncesGroupUri(resourceUri);
      const announcersGroupUri = getAnnouncersGroupUri(resourceUri);

      await ctx.call('webacl.group.create', { groupUri: announcesGroupUri, webId: creator.id });
      await ctx.call('webacl.group.create', { groupUri: announcersGroupUri, webId: creator.id });

      // Give read rights for the resource
      await ctx.call('webacl.resource.addRights', {
        resourceUri,
        additionalRights: {
          group: {
            uri: announcesGroupUri,
            read: true,
          },
        },
        webId: creator.id,
      });

      // Give read rights to announcers for the list of announces
      await ctx.call('webacl.resource.addRights', {
        resourceUri: object['apods:announces'],
        additionalRights: {
          group: {
            uri: announcersGroupUri,
            read: true,
          },
        },
        webId: creator.id,
      });

      if (creator.url) {
        // Give read right for the creator's profile
        await ctx.call('webacl.resource.addRights', {
          resourceUri: creator.url,
          additionalRights: {
            group: {
              uri: announcesGroupUri,
              read: true,
            },
          },
          webId: creator.id,
        });
      }
    },
  },
  activities: {
    announce: {
      async match(activity) {
        if (this.settings.watchedTypes.length === 0) return false;
        return await this.matchActivity(
          {
            type: ACTIVITY_TYPES.ANNOUNCE,
            object: {
              type: this.settings.watchedTypes,
            },
          },
          activity
        );
      },
      async onEmit(ctx, activity, emitterUri) {
        if (emitterUri !== activity.object['dc:creator']) {
          throw new Error('Only the creator has the right to share the object ' + activity.object.id);
        }

        // Add all targeted actors to the collection and WebACL group
        // TODO check if we could not use activity.to instead of activity.target (and change this everywhere)
        for (let actorUri of defaultToArray(activity.target)) {
          await ctx.call('activitypub.collection.attach', {
            collectionUri: activity.object['apods:announces'],
            item: actorUri,
          });

          // TODO automatically synchronize the collection with the ACL group
          await ctx.call('webacl.group.addMember', {
            groupUri: getAnnouncesGroupUri(activity.object.id),
            memberUri: actorUri,
            webId: activity.object['dc:creator'],
          });
        }
      },
      async onReceive(ctx, activity, recipients) {
        // Wait 10s to ensure all recipients have been given read rights to the event
        // (Otherwise we may have a race condition with the onEmit function above)
        await delay(process.env.NODE_ENV === 'test' ? 500 : 10000);

        for (let recipientUri of recipients) {
          // Cache remote object (we want to be able to fetch it with SPARQL)
          await ctx.call('activitypub.object.cacheRemote', {
            objectUri: activity.object.id,
            actorUri: recipientUri,
          });
        }
      },
    },
    offerAnnounceByOrganizer: {
      async match(activity) {
        const dereferencedActivity = await this.matchActivity(
          {
            type: ACTIVITY_TYPES.OFFER,
            object: {
              type: ACTIVITY_TYPES.ANNOUNCE,
              object: {
                type: this.settings.watchedTypes,
              },
            },
          },
          activity
        );
        // If the emitter is the organizer, it means we want to give actors the right to announce the given object
        if (dereferencedActivity && dereferencedActivity.actor === dereferencedActivity.object.object['dc:creator']) {
          return dereferencedActivity;
        }
      },
      async onEmit(ctx, activity) {
        // Add all announcers to the collection and WebACL group
        for (let actorUri of defaultToArray(activity.target)) {
          await ctx.call('activitypub.collection.attach', {
            collectionUri: activity.object.object['apods:announcers'],
            item: actorUri,
          });

          await ctx.call('webacl.group.addMember', {
            groupUri: getAnnouncersGroupUri(activity.object.object.id),
            memberUri: actorUri,
            webId: activity.object.object['dc:creator'],
          });
        }
      },
    },
    offerAnnounceToOrganizer: {
      async match(activity) {
        const dereferencedActivity = await this.matchActivity(
          {
            type: ACTIVITY_TYPES.OFFER,
            object: {
              type: ACTIVITY_TYPES.ANNOUNCE,
              object: {
                type: this.settings.watchedTypes,
              },
            },
          },
          activity
        );
        // If the offer is directed to the organizer, it means we are an announcer and want him to announce the object to one of our contacts
        if (dereferencedActivity && dereferencedActivity.target === dereferencedActivity.object.object['dc:creator']) {
          return dereferencedActivity;
        }
      },
      async onReceive(ctx, activity) {
        const object = activity.object.object;
        const creator = await ctx.call('activitypub.actor.get', { actorUri: object['dc:creator'] });

        const isAnnouncer = await ctx.call('activitypub.collection.includes', {
          collectionUri: object['apods:announcers'],
          itemUri: activity.actor,
        });

        if (!isAnnouncer) {
          throw new Error(`Actor ${activity.actor} was not given permission to announce the object ${object.id}`);
        }

        await ctx.call('activitypub.outbox.post', {
          collectionUri: creator.outbox,
          type: ACTIVITY_TYPES.ANNOUNCE,
          actor: creator.id,
          object: object.id,
          target: activity.object.target,
          to: activity.object.target,
        });

        // Inform the announcer that his offer has been accepted (this is not used currently)
        await ctx.call('activitypub.outbox.post', {
          collectionUri: creator.outbox,
          type: ACTIVITY_TYPES.ACCEPT,
          actor: creator.id,
          object: activity.id,
          to: activity.actor,
        });
      },
    },
  },
};
