const urlJoin = require('url-join');
const { ActivitiesHandlerMixin, ACTIVITY_TYPES, ACTOR_TYPES } = require('@semapps/activitypub');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');
const { arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { ADD_CONTACT, REMOVE_CONTACT, IGNORE_CONTACT, UNDO_IGNORE_CONTACT } = require('../../config/patterns');

module.exports = {
  name: 'contacts.manager',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    ignoredContactsCollectionOptions: {
      path: '/ignored-contacts',
      attachToTypes: [ACTOR_TYPES.PERSON],
      attachPredicate: 'http://activitypods.org/ns/core#ignoredContacts',
      ordered: false,
      dereferenceItems: false,
      permissions: {} // This collection is only visible by the Pod owner
    }
  },
  dependencies: ['activitypub.collections-registry', 'webacl'],
  async started() {
    await this.broker.call('activitypub.collections-registry.register', this.settings.ignoredContactsCollectionOptions);
  },
  actions: {
    async updateCollectionsOptions(ctx) {
      const { dataset } = ctx.params;
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: this.settings.ignoredContactsCollectionOptions,
        dataset
      });
    }
  },
  activities: {
    addContact: {
      match: ADD_CONTACT,
      async onEmit(ctx, activity, emitterUri) {
        if (!activity.origin) throw new Error('The origin property is missing from the Add activity');

        if (!activity.origin.startsWith(emitterUri))
          throw new Error(`Cannot add to collection ${activity.origin} as it is not owned by the emitter`);

        await ctx.call('activitypub.collection.add', {
          collectionUri: activity.origin,
          item: activity.object.id
        });

        if (activity.object.url) {
          await ctx.call('ldp.remote.store', {
            resourceUri: activity.object.url,
            webId: emitterUri
          });
          await ctx.call('profiles.profile.attach', {
            resourceUri: activity.object.url,
            webId: emitterUri
          });
        }
      }
    },
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

        if (activity.object.url) {
          await ctx.call('ldp.remote.delete', {
            resourceUri: activity.object.url,
            webId: emitterUri
          });
        }
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
      async match(activity, fetcher) {
        if (activity.type === ACTIVITY_TYPES.DELETE) {
          const dereferencedObject = await fetcher(activity.object);
          if (Object.values(ACTOR_TYPES).some(t => arrayOf(dereferencedObject.type).includes(t))) {
            return { match: true, dereferencedActivity: { ...activity, object: dereferencedObject } };
          }
        }
        return { match: false, dereferencedActivity: activity };
      },
      async onReceive(ctx, activity, recipientUri) {
        // See also https://swicg.github.io/activitypub-http-signature/#handling-deletes-of-actors for more sophisticated approaches.
        if (!(activity.actor === activity.object.id))
          throw new Error(`The actor ${activity.actor} cannot ask to remove actor ${activity.object.id}`);

        // Temporarily stop processing Mastodon delete requests because they are too many and Fuseki ends up crashing
        // See https://github.com/activitypods/activitypods/issues/347
        if (activity?.id.endsWith('#delete')) {
          return;
        }

        const actorToDelete = activity.object.id;
        const storageUrl = await ctx.call('solid-storage.getUrl', { webId: actorToDelete });

        const recipient = await ctx.call('activitypub.actor.get', { actorUri: recipientUri });

        const account = await ctx.call('auth.account.findByWebId', { webId: recipientUri });
        const dataset = account.username;

        // If the recipient owns the group, remove it
        if (arrayOf(account.owns).includes(actorToDelete)) {
          await ctx.call(
            'groups.undoClaim',
            { username: dataset, groupWebId: actorToDelete },
            { meta: { webId: recipientUri } }
          );
        }

        // Delete from all collections where this actor is included (contacts, followers, following...)
        await ctx.call('triplestore.update', {
          query: sanitizeSparqlQuery`
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
              FILTER( STRSTARTS( STR(?resourceUri), "${urlJoin(storageUrl, '/')}" ) ) .
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
              FILTER( STRSTARTS( STR(?activityUrl), "${urlJoin(storageUrl, '/')}" ) ) .
            }
          `,
          webId: 'system',
          dataset
        });

        // Remove actor from all ACL groups
        await ctx.call('triplestore.update', {
          query: sanitizeSparqlQuery`
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
          query: sanitizeSparqlQuery`
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

        // Ensure the actor requesting deletion still exists before sending back an Accept activity
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: activity.actor });
        if (emitter && emitter.inbox) {
          ctx.call('activitypub.outbox.post', {
            collectionUri: recipient.outbox,
            type: ACTIVITY_TYPES.ACCEPT,
            object: activity.id,
            to: activity.actor
          });
        }
      }
    }
  }
};
