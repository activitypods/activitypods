const { defaultToArray, getDatasetFromUri } = require('@semapps/ldp');
const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { getAnnouncesGroupUri, getAnnouncersGroupUri } = require('./utils');
const { PodActivitiesHandlerMixin } = require('@activitypods/app');

module.exports = {
  name: 'announcer',
  mixins: [PodActivitiesHandlerMixin],
  settings: {
    announcesCollectionOptions: {
      attachPredicate: 'http://activitypods.org/ns/core#announces',
      ordered: false,
      dereferenceItems: false
    },
    announcersCollectionOptions: {
      attachPredicate: 'http://activitypods.org/ns/core#announcers',
      ordered: false,
      dereferenceItems: false
    }
  },
  actions: {
    async giveRightsAfterAnnouncersCollectionCreate(ctx) {
      const { objectUri } = ctx.params;

      const object = await ctx.call('ldp.resource.awaitCreateComplete', {
        resourceUri: objectUri,
        predicates: ['apods:announcers']
      });

      // Add the creator to the list of announcers
      await ctx.call('activitypub.collection.add', {
        collectionUri: object['apods:announcers'],
        item: object['dc:creator']
      });

      const announcersGroupUri = getAnnouncersGroupUri(objectUri);
      await ctx.call('webacl.group.create', { groupUri: announcersGroupUri, webId: object['dc:creator'] });

      // Give read rights to announcers for the list of announces
      await ctx.call('webacl.resource.addRights', {
        resourceUri: object['apods:announces'],
        additionalRights: {
          group: {
            uri: announcersGroupUri,
            read: true
          }
        },
        webId: object['dc:creator']
      });
    }
  },
  activities: {
    announce: {
      match: {
        type: ACTIVITY_TYPES.ANNOUNCE,
        object: {
          type: OBJECT_TYPES.EVENT
        }
      },
      async onEmit(ctx, activity, actorUri) {
        const resource = activity.object;
        const resourceUri = object.id;

        if (actorUri !== resource['dc:creator']) {
          throw new Error('Only the creator has the right to share the object ' + resourceUri);
        }

        const { attachPredicate, ...collectionOptions } = this.settings.announcesCollectionOptions;
        const announcesCollectionUri = await ctx.call('pod-collections.createAndAttach', {
          resourceUri,
          attachPredicate,
          collectionOptions,
          actorUri
        });

        const { ok, body: creator } = await ctx.call('pod-resources.get', {
          resourceUri: resource['dc:creator'],
          actorUri
        });

        if (ok) {
          const announcesGroupUri = getAnnouncesGroupUri(announcesCollectionUri);
          await ctx.call('pod-wac-groups.create', { groupUri: announcesGroupUri, actorUri });

          // Give read rights for the resource
          await ctx.call('pod-permissions.add', {
            uri: resourceUri,
            agentUri: announcesGroupUri,
            agentPredicate: 'acl:agentGroup',
            mode: 'acl:Read',
            actorUri
          });

          if (creator.url) {
            await ctx.call('pod-permissions.add', {
              uri: creator.url,
              agentUri: announcesGroupUri,
              agentPredicate: 'acl:agentGroup',
              mode: 'acl:Read',
              actorUri
            });
          }

          // Add all targeted actors to the collection and WebACL group
          // TODO check if we could not use activity.to instead of activity.target (and change this everywhere)
          for (let recipientUri of defaultToArray(activity.target)) {
            await ctx.call('pod-collections.add', {
              collectionUri: announcesCollectionUri,
              item: recipientUri,
              actorUri
            });

            // TODO automatically synchronize the collection with the ACL group
            await ctx.call('pod-wac-groups.addMember', {
              groupUri: announcesGroupUri,
              memberUri: recipientUri,
              actorUri
            });
          }
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        const resource = activity.object;
        const resourceUri = resource.id;
        const resourceType = resource['@type'] || resource.type;

        // Sometimes when reposting, a recipient may be the original announcer
        // So ensure this is a remote resource before storing it locally
        if (await ctx.call('ldp.remote.isRemote', { resourceUri, webId: recipientUri })) {
          try {
            // Cache remote object (we want to be able to fetch it with SPARQL)
            await ctx.call('ldp.remote.store', {
              resource,
              webId: recipientUri
            });

            const container = await ctx.call('ldp.registry.getByType', {
              type: resourceType,
              dataset: getDatasetFromUri(recipientUri)
            });
            if (!container)
              throw new Error(`Cannot store resource of type "${resourceType}", no matching containers were found!`);
            const containerUri = await ctx.call('ldp.registry.getUri', { path: container.path, webId: recipientUri });

            await ctx.call('ldp.container.attach', {
              containerUri,
              resourceUri,
              webId: recipientUri
            });
          } catch (e) {
            this.logger.warn(
              `Unable to cache remote object ${resourceUri} for actor ${recipientUri}. Message: ${e.message}`
            );
          }
        }
      }
    },
    offerAnnounce: {
      match: {
        type: ACTIVITY_TYPES.OFFER,
        object: {
          type: ACTIVITY_TYPES.ANNOUNCE
        }
      },
      async onEmit(ctx, activity) {
        const object = await ctx.call('ldp.resource.get', {
          resourceUri: typeof activity.object.object === 'string' ? activity.object.object : activity.object.object.id,
          accept: MIME_TYPES.JSON
        });

        // If the emitter is the organizer, it means we want to give actors the right to announce the given object
        if (activity.actor === object['dc:creator']) {
          const announcersCollectionUri = await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
            objectUri: object.id,
            collection: this.settings.announcersCollectionOptions
          });

          await this.actions.giveRightsAfterAnnouncersCollectionCreate({ objectUri: object.id }, { parentCtx: ctx });

          // Add all announcers to the collection and WebACL group
          for (let actorUri of defaultToArray(activity.target)) {
            await ctx.call('activitypub.collection.add', {
              collectionUri: announcersCollectionUri,
              item: actorUri
            });

            await ctx.call('webacl.group.addMember', {
              groupUri: getAnnouncersGroupUri(object.id),
              memberUri: actorUri,
              webId: activity.object.object['dc:creator']
            });
          }
        }
      },
      async onReceive(ctx, activity) {
        const object = await ctx.call('ldp.resource.get', {
          resourceUri: typeof activity.object.object === 'string' ? activity.object.object : activity.object.object.id,
          accept: MIME_TYPES.JSON
        });

        // If the offer is targeted to the organizer, it means we are an announcer and want him to announce the object to one of our contacts
        if (activity.target === object['dc:creator']) {
          if (!object['apods:announcers']) {
            this.logger.warn(`No announcers collection attached to object ${object.id}, skipping...`);
            return;
          }

          const creator = await ctx.call('activitypub.actor.get', { actorUri: object['dc:creator'] });

          const isAnnouncer = await ctx.call('activitypub.collection.includes', {
            collectionUri: object['apods:announcers'],
            itemUri: activity.actor
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
            to: activity.object.target
          });
        }
      }
    }
  }
};
