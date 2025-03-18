const { ACTIVITY_TYPES, ACTOR_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const {
  CONTACT_REQUEST,
  ACCEPT_CONTACT_REQUEST,
  REJECT_CONTACT_REQUEST,
  IGNORE_CONTACT_REQUEST
} = require('../../config/patterns');
const {
  CONTACT_REQUEST_MAPPING,
  ACCEPT_CONTACT_REQUEST_MAPPING,
  AUTO_ACCEPTED_CONTACT_REQUEST_MAPPING
} = require('../../config/mappings');
const hasActivityGrant = require('../utils/hasActivityGrant');

/** @type {import('moleculer').ServiceSchema} */
module.exports = {
  name: 'contacts.request',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    contactsCollectionOptions: {
      path: '/contacts',
      attachToTypes: [ACTOR_TYPES.PERSON],
      attachPredicate: 'http://activitypods.org/ns/core#contacts',
      ordered: false,
      dereferenceItems: false
    },
    contactRequestsCollectionOptions: {
      path: '/contact-requests',
      attachToTypes: [ACTOR_TYPES.PERSON],
      attachPredicate: 'http://activitypods.org/ns/core#contactRequests',
      ordered: false,
      dereferenceItems: true
    },
    rejectedContactsCollectionOptions: {
      path: '/rejected-contacts',
      attachToTypes: [ACTOR_TYPES.PERSON],
      attachPredicate: 'http://activitypods.org/ns/core#rejectedContacts',
      ordered: false,
      dereferenceItems: false
    }
  },
  dependencies: ['activitypub.collections-registry', 'webacl'],
  async started() {
    await this.broker.call('activitypub.collections-registry.register', this.settings.contactsCollectionOptions);
    await this.broker.call('activitypub.collections-registry.register', this.settings.contactRequestsCollectionOptions);
    await this.broker.call(
      'activitypub.collections-registry.register',
      this.settings.rejectedContactsCollectionOptions
    );
  },
  actions: {
    async updateCollectionsOptions(ctx) {
      const { dataset } = ctx.params;
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: this.settings.contactsCollectionOptions,
        dataset
      });
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: this.settings.contactRequestsCollectionOptions,
        dataset
      });
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: this.settings.rejectedContactsCollectionOptions,
        dataset
      });
    }
  },
  activities: {
    contactRequest: {
      match: CONTACT_REQUEST,
      async onEmit(ctx, activity, emitterUri) {
        // Add the user to the contacts WebACL group so he can see my profile
        for (let targetUri of arrayOf(activity.target)) {
          await ctx.call('webacl.group.addMember', {
            groupSlug: `${new URL(emitterUri).pathname}/contacts`, // This doesn't lead to the receiver having access to profile...?
            memberUri: targetUri,
            webId: emitterUri
          });
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        const recipient = await ctx.call('activitypub.actor.get', { actorUri: recipientUri });

        // If the actor is already in my contacts, ignore this request (may happen for automatic post-event requests)
        if (
          await ctx.call('activitypub.collection.includes', {
            collectionUri: recipient['apods:contacts'],
            itemUri: activity.actor
          })
        ) {
          return;
        }

        // If the request was already rejected, reject it again
        if (
          await ctx.call('activitypub.collection.includes', {
            collectionUri: recipient['apods:rejectedContacts'],
            itemUri: activity.actor
          })
        ) {
          await ctx.call('activitypub.outbox.post', {
            collectionUri: recipient.outbox,
            type: ACTIVITY_TYPES.REJECT,
            actor: recipient.id,
            object: activity.id,
            to: activity.actor
          });
          return;
        }

        // Check, if an invite capability is present. If so, accept the request automatically.
        // TODO: Test.
        if (
          hasActivityGrant(activity, {
            type: ACTIVITY_TYPES.OFFER,
            actor: activity.actor,
            object: {
              type: ACTIVITY_TYPES.ADD,
              target: recipientUri,
              object: {
                id: activity.actor?.id || activity.actor,
                type: OBJECT_TYPES.PROFILE
              }
            }
          })
        ) {
          const verificationResult = await ctx.call('crypto.vc.verifier.verifyCapabilityPresentation', {
            verifiablePresentation: activity.capability
          });
          if (!verificationResult.verified) {
            ctx.broker.logger.warn(
              'Capability presentation verification for contact request failed. Actor and error:',
              activity.actor,
              verificationResult.error
            );
            return;
          }

          // Check that first issuer is the recipient.
          if (!activity.capability.verifiableCredential[0].issuer === recipient.id) {
            ctx.broker.logger.warn(
              'The first issuer of the capability should be the recipient of the contact request. Issuer and recipient:',
              activity.capability.verifiableCredential[0].issuer,
              recipient.id
            );
          }

          // Send the accept.
          await ctx.call('activitypub.outbox.post', {
            collectionUri: recipient.outbox,
            type: ACTIVITY_TYPES.ACCEPT,
            actor: recipient.id,
            object: activity.id,
            to: activity.actor
          });

          // Notify about auto-accept.
          await ctx.call('mail-notifications.notify', {
            template: AUTO_ACCEPTED_CONTACT_REQUEST_MAPPING,
            recipientUri,
            activity,
            context: activity.id
          });

          return;
        }

        // Check that a request by the same actor is not already waiting (if so, ignore it)
        const collection = await ctx.call('activitypub.collection.get', {
          resourceUri: recipient['apods:contactRequests'],
          webId: recipientUri
        });
        if (
          collection &&
          arrayOf(collection.items).length > 0 &&
          arrayOf(collection.items).find(a => a.actor === activity.actor)
        ) {
          return;
        }

        await ctx.call('activitypub.collection.add', {
          collectionUri: recipient['apods:contactRequests'],
          item: activity
        });

        await ctx.call('mail-notifications.notify', {
          template: CONTACT_REQUEST_MAPPING,
          recipientUri,
          activity,
          context: activity.id
        });
      }
    },
    acceptContactRequest: {
      match: ACCEPT_CONTACT_REQUEST,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: emitterUri });

        // 1. Add the other actor to the contacts WebACL group so he can see my profile
        await ctx.call('webacl.group.addMember', {
          groupSlug: `${new URL(emitterUri).pathname}/contacts`,
          memberUri: activity.to,
          webId: emitterUri
        });

        // 2. Cache the other actor's profile
        await ctx.call('ldp.remote.store', {
          resource: activity.object.object.object,
          webId: emitterUri
        });

        // 3. Attach the other actor's profile to my profiles container
        await ctx.call('profiles.profile.attach', {
          resourceUri: activity.object.object.object.id,
          webId: emitterUri
        });

        // 4. Add the other actor to my contacts list
        await ctx.call('activitypub.collection.add', {
          collectionUri: emitter['apods:contacts'],
          item: activity.object.actor
        });

        // 5. Remove the activity from my contact requests
        await ctx.call('activitypub.collection.remove', {
          collectionUri: emitter['apods:contactRequests'],
          item: activity.object.id
        });
      },
      async onReceive(ctx, activity, recipientUri) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: activity.actor });
        const recipient = await ctx.call('activitypub.actor.get', { actorUri: recipientUri });

        // Cache the other actor's profile (it should be visible now)
        await ctx.call('ldp.remote.store', {
          resourceUri: emitter.url,
          webId: recipientUri
        });

        // Attach the other actor's profile to my profiles container
        await ctx.call('profiles.profile.attach', {
          resourceUri: emitter.url,
          webId: recipientUri
        });

        // Add the other actor to my contacts list
        await ctx.call('activitypub.collection.add', {
          collectionUri: recipient['apods:contacts'],
          item: emitter.id
        });

        // If the contact request was automatically accepted, or if the initial
        // request had a context (case for attendees matcher), don't send a notification
        if (!activityHasInviteCapability(activity) && !activity.object.context) {
          await ctx.call('mail-notifications.notify', {
            template: ACCEPT_CONTACT_REQUEST_MAPPING,
            recipientUri,
            activity,
            context: activity.id
          });
        }
      }
    },
    ignoreContactRequest: {
      match: IGNORE_CONTACT_REQUEST,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: emitterUri });

        // Remove the activity from my contact requests
        await ctx.call('activitypub.collection.remove', {
          collectionUri: emitter['apods:contactRequests'],
          item: activity.object.id
        });
      },
      async onReceive(ctx, activity, recipientUri) {
        // Remove the user from the contacts WebACL group so he can't see my profile anymore
        await ctx.call('webacl.group.removeMember', {
          groupSlug: `${new URL(recipientUri).pathname}/contacts`,
          memberUri: activity.actor,
          webId: recipientUri
        });
      }
    },
    rejectContactRequest: {
      match: REJECT_CONTACT_REQUEST,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: emitterUri });

        // Add the actor to my rejected contacts list
        await ctx.call('activitypub.collection.add', {
          collectionUri: emitter['apods:rejectedContacts'],
          item: activity.object.actor
        });

        // Remove the activity from my contact requests
        await ctx.call('activitypub.collection.remove', {
          collectionUri: emitter['apods:contactRequests'],
          item: activity.object.id
        });
      },
      async onReceive(ctx, activity, recipientUri) {
        // Remove the emitter from the contacts WebACL group so he can't see the recipient's profile anymore
        await ctx.call('webacl.group.removeMember', {
          groupSlug: `${new URL(recipientUri).pathname}/contacts`,
          memberUri: activity.actor,
          webId: recipientUri
        });
      }
    }
  }
};
