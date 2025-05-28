const path = require('path');
const urlJoin = require('url-join');
const { arrayOf, getDatasetFromUri } = require('@semapps/ldp');
const { ACTIVITY_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const matchActivity = require('@semapps/activitypub/utils/matchActivity');

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
      async match(activity, fetcher) {
        const { match, dereferencedActivity } = await matchActivity(
          {
            type: ACTIVITY_TYPES.ANNOUNCE
          },
          activity,
          fetcher
        );
        return {
          match: match && !(await this.broker.call('activitypub.activity.isPublic', { activity })),
          dereferencedActivity
        };
      },
      async onEmit(ctx, activity, emitterUri) {
        const resourceUri = typeof activity.object === 'string' ? activity.object : activity.object.id;

        const resource = await ctx.call('ldp.resource.get', {
          resourceUri,
          accept: MIME_TYPES.JSON,
          webId: emitterUri
        });

        /**
         * CHECK PERMISSIONS
         */

        if (emitterUri !== resource['dc:creator']) {
          if (!resource['apods:announcers']) {
            this.logger.warn(`No announcers collection attached to object ${resource.id}, skipping...`);
            return;
          }

          // Check if the emitter has a grant which allow delegation
          const isAnnouncer = await ctx.call('activitypub.collection.includes', {
            collectionUri: resource['apods:announcers'],
            itemUri: emitterUri
          });

          if (!isAnnouncer) {
            throw new Error(`Actor ${emitterUri} was not given permission to announce the object ${resource.id}`);
          }
        }

        /**
         * CREATE AUTHORIZATIONS FOR AGENTS
         */

        for (let grantee of arrayOf(activity.to)) {
          await ctx.call('access-authorizations.addForSingleResource', {
            resourceUri,
            grantee,
            accessModes: ['acl:Read'],
            delegationAllowed: !!activity['interop:delegationAllowed'],
            delegationLimit: activity['interop:delegationLimit']
          });
        }

        /**
         * CREATE ANNOUNCES COLLECTION AND ADD RECIPIENTS
         */

        // Skip this part if a delegation, will be done through the delegated-access-grants.issued event
        if (emitterUri === resource['dc:creator']) {
          const announcesCollectionUri = await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
            objectUri: resourceUri,
            collection: this.settings.announcesCollectionOptions
          });

          await this.actions.giveRightsAfterAnnouncesCollectionCreate({ objectUri: resourceUri }, { parentCtx: ctx });

          // Add all recipients to the announces collection and WebACL group
          for (let actorUri of arrayOf(activity.to)) {
            await ctx.call('activitypub.collection.add', {
              collectionUri: announcesCollectionUri,
              item: actorUri
            });

            await ctx.call('webacl.group.addMember', {
              groupUri: getAnnouncesGroupUri(resourceUri),
              memberUri: actorUri,
              webId: resource['dc:creator']
            });
          }
        }

        /**
         * CREATE ANNOUNCERS COLLECTION AND ADD RECIPIENTS (IF DELEGATION IS ALLOWED)
         */

        if (activity['interop:delegationAllowed']) {
          if (emitterUri !== resource['dc:creator']) {
            throw new Error(`Only the owner of ${resource.id} can allow delegation`);
          }

          const announcersCollectionUri = await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
            objectUri: resourceUri,
            collection: this.settings.announcersCollectionOptions
          });

          await this.actions.giveRightsAfterAnnouncersCollectionCreate({ objectUri: resourceUri }, { parentCtx: ctx });

          // Add all recipients to the announcers collection and WebACL group
          for (let actorUri of arrayOf(activity.to)) {
            await ctx.call('activitypub.collection.add', {
              collectionUri: announcersCollectionUri,
              item: actorUri
            });

            await ctx.call('webacl.group.addMember', {
              groupUri: getAnnouncersGroupUri(resourceUri),
              memberUri: actorUri,
              webId: resource['dc:creator']
            });
          }
        }
      },
      /**
       * On receipt of an announce activity, cache locally the announced object
       */
      async onReceive(ctx, activity, recipientUri) {
        const resourceUri = typeof activity.object === 'string' ? activity.object : activity.object.id;

        // Sometimes a recipient may be the original announcer
        // So ensure this is a remote resource before storing it locally
        if (!resourceUri.startsWith(urlJoin(recipientUri, '/'))) {
          // Get the latest version of the resource and store it locally
          const resource = await ctx.call('ldp.remote.store', {
            resourceUri,
            webId: recipientUri
          });

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
    }
  },
  events: {
    // When a delegated grant is issued, add the grantee to the announces collection
    // This hack will be gone when we can do without announces/announcers collections
    async 'delegated-access-grants.issued'(ctx) {
      const { delegatedGrant } = ctx.params;

      if (delegatedGrant['interop:granteeType'] === 'interop:Application') {
        this.logger.warn(`Delegated grant is for application, skip adding to the announces collection...`);
        return;
      }

      ctx.meta.webId = delegatedGrant['interop:dataOwner'];
      ctx.meta.dataset = getDatasetFromUri(delegatedGrant['interop:dataOwner']);

      for (const resourceUri of arrayOf(delegatedGrant['interop:hasDataInstance'])) {
        const announcesCollectionUri = await ctx.call('activitypub.collections-registry.createAndAttachCollection', {
          objectUri: resourceUri,
          collection: this.settings.announcesCollectionOptions
        });

        await this.actions.giveRightsAfterAnnouncesCollectionCreate({ objectUri: resourceUri }, { parentCtx: ctx });

        await ctx.call('activitypub.collection.add', {
          collectionUri: announcesCollectionUri,
          item: delegatedGrant['interop:grantee']
        });

        await ctx.call('webacl.group.addMember', {
          groupUri: getAnnouncesGroupUri(resourceUri),
          memberUri: delegatedGrant['interop:grantee']
        });
      }
    }
  }
};
