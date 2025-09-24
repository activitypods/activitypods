import { ServiceSchema } from 'moleculer';
import { getId, getType } from '@semapps/ldp';
import { ACTIVITY_TYPES, ActivitiesHandlerMixin, matchActivity } from '@semapps/activitypub';
import ConvertBooleanMixin from './convert-booleans.ts';
import ConvertIntegerMixin from './convert-integers.ts';

/**
 * Mixin used by the AccessGrantsService and DelegatedAccessGrantsService
 */
const AccessGrantsMixin = {
  mixins: [ActivitiesHandlerMixin, ConvertBooleanMixin, ConvertIntegerMixin],
  settings: {
    // Fuseki 5 returns booleans and integer as strings so we must convert them manually
    booleanPredicates: ['interop:delegationAllowed'],
    integerPredicates: ['interop:delegationLimit']
  },
  hooks: {
    after: {
      async create(ctx, res) {
        const grant = res.newData;

        // The grantee must be able to read the grant
        await ctx.call('webacl.resource.addRights', {
          resourceUri: getId(grant),
          additionalRights: {
            user: {
              uri: grant['interop:grantee'],
              read: true
            }
          },
          webId: 'system'
        });

        // The granter must be able to read and delete the grant
        if (getType(grant) === 'interop:DelegatedAccessGrant') {
          await ctx.call('webacl.resource.addRights', {
            resourceUri: getId(grant),
            additionalRights: {
              user: {
                uri: grant['interop:grantedBy'],
                read: true,
                write: true
              }
            },
            webId: 'system'
          });
        }

        // Attach grant to agent registrations, unless it is a delegated grant (will be done by the issuer)
        if (getType(grant) === 'interop:AccessGrant') {
          if (grant['interop:granteeType'] === 'interop:Application') {
            await ctx.call('app-registrations.addGrant', { grant });
          } else {
            await ctx.call('social-agent-registrations.addGrant', { grant });
          }
        }

        // Only send notifications for grants generated for social agents
        // For delegated grants, the granter will take care of notifying the grantee
        if (getType(grant) === 'interop:AccessGrant' && grant['interop:granteeType'] === 'interop:SocialAgent') {
          const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
            actorUri: grant['interop:dataOwner'],
            predicate: 'outbox'
          });

          await ctx.call(
            'activitypub.outbox.post',
            {
              collectionUri: outboxUri,
              type: ACTIVITY_TYPES.CREATE,
              object: getId(grant),
              to: grant['interop:grantee'],
              transient: true
            },
            { meta: { webId: grant['interop:dataOwner'] } }
          );
        }

        return res;
      },
      async delete(ctx, res) {
        const grant = res.oldData;

        // Detach grant from agent registrations, unless it is a delegated grant (will be done by the issuer)
        if (getType(grant) === 'interop:AccessGrant') {
          if (grant['interop:granteeType'] === 'interop:Application') {
            await ctx.call('app-registrations.removeGrant', { grant });
          } else {
            await ctx.call('social-agent-registrations.removeGrant', { grant });
          }
        }

        // Only send Delete activity for access grants, when the grantee is a social agent and when this is not a replacement
        // TODO: Warn grantees when delegated grants are deleted by the granter
        if (
          getType(grant) === 'interop:AccessGrant' &&
          grant['interop:granteeType'] === 'interop:SocialAgent' &&
          !ctx.params.isReplacing
        ) {
          const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
            actorUri: grant['interop:dataOwner'],
            predicate: 'outbox'
          });

          await ctx.call(
            'activitypub.outbox.post',
            {
              collectionUri: outboxUri,
              type: ACTIVITY_TYPES.DELETE,
              object: getId(grant),
              to: grant['interop:grantee'],
              transient: true
            },
            { meta: { webId: grant['interop:dataOwner'] } }
          );
        }

        return res;
      }
    }
  },
  activities: {
    createGrant: {
      async match(activity: any, fetcher: any) {
        return matchActivity(
          {
            type: ACTIVITY_TYPES.CREATE,
            object: {
              // @ts-expect-error TS(2339): Property 'settings' does not exist on type '{ matc... Remove this comment to see the full error message
              type: this.settings.acceptedTypes[0]
            }
          },
          activity,
          fetcher
        );
      },
      async onReceive(ctx: any, activity: any, recipientUri: any) {
        const grant = activity.object;

        // Delete from cache the old grant
        if (grant['interop:replaces']) {
          try {
            await ctx.call('ldp.remote.delete', {
              resourceUri: grant['interop:replaces'],
              webId: recipientUri
            });
          } catch (e) {
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ match(... Remove this comment to see the full error message
            this.logger.warn(
              `Could not delete grant ${grant['interop:replaces']} on storage of ${recipientUri}. Ignoring...`
            );
          }
        }

        // Generate delegated grants for all authorizations with `interop:All` scope
        await ctx.call('delegated-access-grants.generateFromAllScopeAllAuthorizations', {
          grant,
          podOwner: recipientUri
        });
      }
    },
    deleteDataGrant: {
      priority: 3, // We want this to be executed before the SynchronizerService delete the object
      async match(activity: any, fetcher: any) {
        return matchActivity(
          {
            type: ACTIVITY_TYPES.DELETE,
            object: {
              // @ts-expect-error TS(2339): Property 'settings' does not exist on type '{ prio... Remove this comment to see the full error message
              type: this.settings.acceptedTypes[0]
            }
          },
          activity,
          fetcher
        );
      },
      async onReceive(ctx: any, activity: any, recipientUri: any) {
        const grant = activity.object;

        if (getType(grant) === 'interop:AccessGrant') {
          // Delete all delegated access grants linked with this access grant
          await ctx.call('delegated-access-grants.deleteByGrant', { grant, webId: recipientUri });
        }
      }
    }
  }
} satisfies Partial<ServiceSchema>;

export default AccessGrantsMixin;
