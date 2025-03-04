const path = require('path');
const urlJoin = require('url-join');
const { arrayOf } = require('@semapps/ldp');
const { ACTIVITY_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');

const getAnnouncesGroupUri = eventUri => {
  const uri = new URL(eventUri);
  uri.pathname = path.join('/_groups', uri.pathname, '/announces');
  return uri.toString();
};

const getAnnouncersGroupUri = eventUri => {
  const uri = new URL(eventUri);
  uri.pathname = path.join('/_groups', uri.pathname, '/announcers');
  return uri.toString();
};

module.exports = {
  name: 'announcer',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    announcesCollectionOptions: {
      path: '/announces',
      attachPredicate: 'http://activitypods.org/ns/core#announces',
      ordered: false,
      dereferenceItems: false,
      permissions: {}
    },
    announcersCollectionOptions: {
      path: '/announcers',
      attachPredicate: 'http://activitypods.org/ns/core#announcers',
      ordered: false,
      dereferenceItems: false,
      permissions: {}
    }
  },
  dependencies: ['activitypub.collections-registry'],
  actions: {
    async giveRightsAfterAnnouncesCollectionCreate(ctx) {
      const { objectUri } = ctx.params;

      const object = await ctx.call('ldp.resource.awaitCreateComplete', {
        resourceUri: objectUri,
        predicates: ['apods:announces']
      });

      const creator = await ctx.call('activitypub.actor.get', { actorUri: object['dc:creator'] });

      const announcesGroupUri = getAnnouncesGroupUri(objectUri);
      const groupExist = await ctx.call('webacl.group.exist', { groupUri: announcesGroupUri, webId: 'system' });
      if (!groupExist) {
        await ctx.call('webacl.group.create', { groupUri: announcesGroupUri, webId: creator.id });
      }

      // Give read rights for the resource
      await ctx.call('webacl.resource.addRights', {
        resourceUri: objectUri,
        additionalRights: {
          group: {
            uri: announcesGroupUri,
            read: true
          }
        },
        webId: creator.id
      });

      if (creator.url) {
        // Give read right for the creator's profile
        await ctx.call('webacl.resource.addRights', {
          resourceUri: creator.url,
          additionalRights: {
            group: {
              uri: announcesGroupUri,
              read: true
            }
          },
          webId: creator.id
        });
      }
    },
    async giveRightsAfterAnnouncersCollectionCreate(ctx) {
      const { objectUri } = ctx.params;

      const object = await ctx.call('ldp.resource.awaitCreateComplete', {
        resourceUri: objectUri,
        predicates: ['apods:announcers', 'apods:announces']
      });

      // Add the creator to the list of announcers
      await ctx.call('activitypub.collection.add', {
        collectionUri: object['apods:announcers'],
        item: object['dc:creator']
      });

      const announcersGroupUri = getAnnouncersGroupUri(objectUri);
      const groupExist = await ctx.call('webacl.group.exist', { groupUri: announcersGroupUri, webId: 'system' });
      if (!groupExist) {
        await ctx.call('webacl.group.create', { groupUri: announcersGroupUri, webId: object['dc:creator'] });
      }

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
    },
    async updateCollectionsOptions(ctx) {
      const { dataset } = ctx.params;
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: this.settings.announcesCollectionOptions,
        dataset
      });
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: this.settings.announcersCollectionOptions,
        dataset
      });
    }
  },
  activities: {
    announce: {
      match: {
        type: ACTIVITY_TYPES.ANNOUNCE
      },
      async onEmit(ctx, activity, emitterUri) {
        const resourceUri = typeof activity.object === 'string' ? activity.object : activity.object.id;

        const resource = await ctx.call('ldp.resource.get', {
          resourceUri,
          accept: MIME_TYPES.JSON,
          webId: emitterUri
        });

        if (emitterUri !== resource['dc:creator']) {
          throw new Error('Only the creator has the right to share the object ' + resourceUri);
        }

        const announcesCollectionUri = await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
          objectUri: resourceUri,
          collection: this.settings.announcesCollectionOptions
        });

        await this.actions.giveRightsAfterAnnouncesCollectionCreate({ objectUri: resourceUri }, { parentCtx: ctx });

        // Add all targeted actors to the collection and WebACL group
        // TODO check if we could not use activity.to instead of activity.target (and change this everywhere)
        for (let actorUri of arrayOf(activity.target)) {
          await ctx.call('activitypub.collection.add', {
            collectionUri: announcesCollectionUri,
            item: actorUri
          });

          // TODO automatically synchronize the collection with the ACL group
          await ctx.call('webacl.group.addMember', {
            groupUri: getAnnouncesGroupUri(resourceUri),
            memberUri: actorUri,
            webId: resource['dc:creator']
          });
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        const resourceUri = typeof activity.object === 'string' ? activity.object : activity.object.id;

        // Sometimes, when reposting, a recipient may be the original announcer
        // So ensure this is a remote resource before storing it locally
        if (!resourceUri.startsWith(urlJoin(recipientUri, '/'))) {
          const resource = await ctx.call('ldp.resource.get', {
            resourceUri,
            accept: MIME_TYPES.JSON,
            webId: recipientUri
          });

          try {
            // Cache remote object (we want to be able to fetch it with SPARQL)
            await ctx.call('ldp.remote.store', {
              resource,
              webId: recipientUri
            });
          } catch (e) {
            this.logger.warn(
              `Unable to cache remote object ${resourceUri} for actor ${recipientUri}. Message: ${e.message}`
            );
          }

          const expandedTypes = await ctx.call('jsonld.parser.expandTypes', {
            types: resource['@type'] || resource.type
          });

          // Go through all the resource's types and attach it to the corresponding container
          for (const expandedType of expandedTypes) {
            let containersUris = await ctx.call('type-registrations.findContainersUris', {
              type: expandedType,
              webId: recipientUri
            });

            // If no container exist yet for this type, create it and register it in the TypeIndex
            if (containersUris.length === 0) {
              // Generate a path for the new container
              const containerPath = await ctx.call('ldp.container.getPath', { resourceType: expandedType });
              this.logger.debug(`Automatically generated the path ${containerPath} for resource type ${expandedType}`);

              // Create the container and attach it to its parent(s)
              const podUrl = await ctx.call('solid-storage.getUrl', { webId: recipientUri });
              containersUris[0] = urlJoin(podUrl, containerPath);
              await ctx.call('ldp.container.createAndAttach', { containerUri: containersUris[0], webId: recipientUri });

              // If the resource type is invalid, an error will be thrown here
              await this.broker.call('type-registrations.register', {
                types: [expandedType],
                containerUri: containersUris[0],
                webId: recipientUri
              });
            }

            for (const containerUri of containersUris) {
              await ctx.call('ldp.container.attach', {
                containerUri,
                resourceUri,
                webId: recipientUri
              });
            }
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
          for (let actorUri of arrayOf(activity.target)) {
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
