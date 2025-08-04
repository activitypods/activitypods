// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
import { ACTIVITY_TYPES, OBJECT_TYPES, ActivitiesHandlerMixin } from '@semapps/activitypub';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const ContactsMessageSchema = {
  name: 'contacts.message' as const,
  // @ts-expect-error TS(2322): Type '{ settings: { path: null; acceptedTypes: nul... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    acceptedTypes: ['as:Note'],
    shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Note'),
    permissions: {},
    newResourcesPermissions: {},
    typeIndex: 'public'
  },
  activities: {
    createNote: {
      match: {
        type: ACTIVITY_TYPES.CREATE,
        object: {
          type: OBJECT_TYPES.NOTE
        }
      },
      async onEmit(ctx: any, activity: any, emitterUri: any) {
        // Ensure the recipients are in the contacts WebACL group of the emitter so they can see his profile (and respond him)
        for (let targetUri of arrayOf(activity.to)) {
          await ctx.call('webacl.group.addMember', {
            groupSlug: new URL(emitterUri).pathname + '/contacts',
            memberUri: targetUri,
            webId: emitterUri
          });
        }
      },
      async onReceive(ctx: any, activity: any, recipientUri: any) {
        // For now, only send notification for direct messages (not sent through followers list, nor CCed)
        // Otherwise we may get dozens of messages from Mastodon actors, which should be read on Mastopod feed
        if (arrayOf(activity.to).includes(recipientUri)) {
          return await ctx.call('mail-notifications.notify', {
            template: {
              title: {
                en: `{{#if activity.object.summary}}{{{activity.object.summary}}}{{else}}{{#if emitterProfile.vcard:given-name}}{{{emitterProfile.vcard:given-name}}}{{else}}{{{emitter.name}}}{{/if}} sent you a message{{/if}}`,
                fr: `{{#if activity.object.summary}}{{{activity.object.summary}}}{{else}}{{#if emitterProfile.vcard:given-name}}{{{emitterProfile.vcard:given-name}}}{{else}}{{{emitter.name}}}{{/if}} vous a envoyé un message{{/if}}`
              },
              content: '{{removeHtmlTags activity.object.content}}',
              actions: [
                {
                  caption: {
                    en: 'Reply',
                    fr: 'Répondre'
                  },
                  link: '/network/{{encodeUri emitter.id}}'
                }
              ]
            },
            recipientUri,
            activity,
            context: activity.object.id
          });
        }
      }
    }
  }
} satisfies ServiceSchema;

export default ContactsMessageSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ContactsMessageSchema.name]: typeof ContactsMessageSchema;
    }
  }
}
