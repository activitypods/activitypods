const urlJoin = require('url-join');
const { ActivitiesHandlerMixin, ACTIVITY_TYPES, ACTOR_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { REMOVE_CONTACT, IGNORE_CONTACT, UNDO_IGNORE_CONTACT, DELETE_ACTOR } = require('../../config/patterns');

module.exports = {
  name: 'contacts.manager',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    ignoredContactsCollectionOptions: {
      path: '/ignored-contacts',
      attachToTypes: Object.values(ACTOR_TYPES),
      attachPredicate: 'http://activitypods.org/ns/core#ignoredContacts',
      ordered: false,
      dereferenceItems: false
    }
  },
  dependencies: ['activitypub.collections-registry', 'webacl'],
  async started() {
    await this.broker.call('activitypub.collections-registry.register', this.settings.ignoredContactsCollectionOptions);
  },
  actions: {
    async updateCollectionsOptions(ctx) {
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: this.settings.ignoredContactsCollectionOptions
      });
    }
  },
  activities: {
    removeContact: {
      match: REMOVE_CONTACT,
      async onEmit(ctx, activity, emitterUri) {
        if (!activity.origin) throw new Error('The origin property is missing from the Remove activity');

        if (!activity.origin.startsWith(emitterUri))
          throw new Error(`Cannot remove from collection ${activity.origin} as it is not owned by the emitter`);

        await ctx.call('activitypub.collection.remove', {
          collectionUri: activity.origin,
          item: activity.object.id
        });

        await ctx.call('ldp.remote.delete', {
          resourceUri: activity.object.url,
          webId: emitterUri
        });
      }
    },
    ignoreContact: {
      match: IGNORE_CONTACT,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: emitterUri });

        // Add the actor to the emitter's ignore contacts list.
        await ctx.call('activitypub.collection.add', {
          collectionUri: emitter['apods:ignoredContacts'],
          item: activity.object
        });
      }
    },
    undoIgnoreContact: {
      match: UNDO_IGNORE_CONTACT,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: emitterUri });

        // Remove the actor from the emitter's ignore contacts list.
        await ctx.call('activitypub.collection.remove', {
          collectionUri: emitter['apods:ignoredContacts'],
          item: activity.object.object
        });
      }
    },
    deleteActor: {
      match: DELETE_ACTOR,
      async onReceive(ctx, activity, recipientUri) {
        // See also https://swicg.github.io/activitypub-http-signature/#handling-deletes-of-actors for more sophisticated approaches.
        if (!(activity.actor === activity.object.id))
          throw new Error(`The actor ${activity.actor} cannot ask to remove actor ${activity.object.id}`);

        const actorToDelete = activity.object.id;
        const podUrl = await ctx.call('pod.getUrl', { webId: actorToDelete });

        const recipient = await ctx.call('activitypub.actor.get', { actorUri: recipientUri });

        const account = await ctx.call('auth.account.findByWebId', { webId: recipientUri });
        const dataset = account.username;

        // Delete from all collections where this actor is included (contacts, followers, following...)
        await ctx.call('triplestore.update', {
          query: `
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            DELETE WHERE {
              ?collection as:items <${actorToDelete}> .
            }
          `,
          webId: 'system',
          dataset
        });

        // Get all cached resources from this Pod
        const result = await ctx.call('triplestore.query', {
          query: `
            SELECT DISTINCT ?resourceUri 
            WHERE {
              ?resourceUri ?p ?o .
              FILTER( STRSTARTS( STR(?resourceUri), "${urlJoin(podUrl, '/')}" ) ) .
            }
          `,
          accept: MIME_TYPES.JSON,
          webId: 'system',
          dataset
        });

        for (let cachedResourceUri of result.map(node => node.resourceUri.value)) {
          await ctx.call('ldp.remote.delete', {
            resourceUri: cachedResourceUri,
            webId: recipientUri
          });
        }

        // Delete all activities from the actor inbox
        await ctx.call('triplestore.update', {
          query: `
            PREFIX as: <https://www.w3.org/ns/activitystreams#>
            PREFIX ldp: <http://www.w3.org/ns/ldp#>
            DELETE {
              ?recipientInbox as:items ?activityUrl .
            } 
            WHERE {
              <${recipientUri}> ldp:inbox ?recipientInbox .
              ?recipientInbox as:items ?activityUrl .
              FILTER( STRSTARTS( STR(?activityUrl), "${urlJoin(podUrl, '/')}" ) ) .
            }
          `,
          webId: 'system',
          dataset
        });

        // Remove actor from all ACL groups
        await ctx.call('triplestore.update', {
          query: `
            PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
            DELETE WHERE {
              GRAPH <http://semapps.org/webacl> {
                ?group vcard:hasMember <${actorToDelete}> .
              }
            }
          `,
          webId: 'system',
          dataset
        });

        // Remove all rights of actor
        await ctx.call('triplestore.update', {
          query: `
            PREFIX acl: <http://www.w3.org/ns/auth/acl#>
            DELETE WHERE {
              GRAPH <http://semapps.org/webacl> {
                ?authorization acl:agent <${actorToDelete}> .
              }
            }
          `,
          webId: 'system',
          dataset
        });

        await ctx.call('activitypub.outbox.post', {
          collectionUri: recipient.outbox,
          type: ACTIVITY_TYPES.ACCEPT,
          object: activity.id,
          to: activity.actor
        });
      }
    }
  }
};
