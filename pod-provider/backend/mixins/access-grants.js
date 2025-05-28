const { arrayOf, getId, getType } = require('@semapps/ldp');
const { ACTIVITY_TYPES, ActivitiesHandlerMixin, matchActivity } = require('@semapps/activitypub');

/**
 * Mixin used by the AccessGrantsService and DelegatedAccessGrantsService
 */
const AccessGrantsMixin = {
  mixins: [ActivitiesHandlerMixin],
  hooks: {
    after: {
      async create(ctx, res) {
        const grant = res.newData;
        const grantee = grant['interop:grantee'];
        const accessMode = arrayOf(grant['interop:accessMode']);
        const scope = grant['interop:scopeOfGrant'];

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

        // For mapping details, see https://github.com/assemblee-virtuelle/activitypods/issues/116
        if (scope === 'interop:AllFromRegistry') {
          // Give read-write permission to the whole container
          await ctx.call('webacl.resource.addRights', {
            resourceUri: grant['interop:hasDataRegistration'],
            additionalRights: {
              // Container rights
              user: {
                uri: grantee,
                read: accessMode.includes('acl:Read'),
                write: accessMode.includes('acl:Write')
              },
              // Resources default rights
              default: {
                user: {
                  uri: grantee,
                  read: accessMode.includes('acl:Read'),
                  append: accessMode.includes('acl:Append'),
                  write: accessMode.includes('acl:Write'),
                  control: accessMode.includes('acl:Control')
                }
              }
            },
            webId: 'system'
          });
        } else if (scope === 'interop:SelectedFromRegistry') {
          for (const resourceUri of arrayOf(grant['interop:hasDataInstance'])) {
            // Give read-write permission to the resources
            await ctx.call('webacl.resource.addRights', {
              resourceUri,
              additionalRights: {
                user: {
                  uri: grantee,
                  read: accessMode.includes('acl:Read'),
                  append: accessMode.includes('acl:Append'),
                  write: accessMode.includes('acl:Write'),
                  control: accessMode.includes('acl:Control')
                }
              },
              webId: 'system'
            });
          }
        } else {
          throw new Error(`Unknown scope ${scope} for access grant ${getId(grant)}`);
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
        const appUri = grant['interop:grantee'];
        const accessMode = arrayOf(grant['interop:accessMode']);
        const scope = grant['interop:scopeOfGrant'];

        if (scope === 'interop:AllFromRegistry') {
          await ctx.call('webacl.resource.removeRights', {
            resourceUri: grant['interop:hasDataRegistration'],
            rights: {
              user: {
                uri: appUri,
                read: accessMode.includes('acl:Read'),
                write: accessMode.includes('acl:Write')
              },
              default: {
                user: {
                  uri: appUri,
                  read: accessMode.includes('acl:Read'),
                  append: accessMode.includes('acl:Append'),
                  write: accessMode.includes('acl:Write'),
                  control: accessMode.includes('acl:Control')
                }
              }
            },
            webId: 'system'
          });
        } else if (scope === 'interop:SelectedFromRegistry') {
          for (const resourceUri of arrayOf(grant['interop:hasDataInstance'])) {
            await ctx.call('webacl.resource.removeRights', {
              resourceUri,
              rights: {
                user: {
                  uri: appUri,
                  read: accessMode.includes('acl:Read'),
                  append: accessMode.includes('acl:Append'),
                  write: accessMode.includes('acl:Write'),
                  control: accessMode.includes('acl:Control')
                }
              },
              webId: 'system'
            });
          }
        } else {
          throw new Error(`Unknown scope ${scope} for access grant ${getId(grant)}`);
        }

        // Detach grant from agent registrations, unless it is a delegated grant (will be done by the issuer)
        if (getType(grant) === 'interop:AccessGrant') {
          if (grant['interop:granteeType'] === 'interop:Application') {
            await ctx.call('app-registrations.removeGrant', { grant });
          } else {
            await ctx.call('social-agent-registrations.removeGrant', { grant });
          }
        }

        // Only send activity for access grants, and when the grantee is a social agent
        // TODO: Warn grantees when delegated grants are deleted by the granter
        if (
          getType(grant) === 'interop:AccessGrant' &&
          !ctx.params.doNotSendActivity &&
          grant['interop:granteeType'] === 'interop:SocialAgent'
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
      async match(activity, fetcher) {
        return matchActivity(
          {
            type: ACTIVITY_TYPES.CREATE,
            object: {
              type: this.settings.acceptedTypes[0]
            }
          },
          activity,
          fetcher
        );
      },
      async onReceive(ctx, activity, recipientUri) {
        const grant = activity.object;

        // Delete from cache the old grant
        if (grant['interop:replaces']) {
          try {
            await ctx.call('ldp.remote.delete', {
              resourceUri: grant['interop:replaces'],
              webId: recipientUri
            });
          } catch (e) {
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
      async match(activity, fetcher) {
        return matchActivity(
          {
            type: ACTIVITY_TYPES.DELETE,
            object: {
              type: this.settings.acceptedTypes[0]
            }
          },
          activity,
          fetcher
        );
      },
      async onReceive(ctx, activity, recipientUri) {
        const grant = activity.object;

        if (getType(grant) === 'interop:AccessGrant') {
          // Delete all delegated access grants linked with this access grant
          await ctx.call('delegated-access-grants.deleteByGrant', { grant, webId: recipientUri });
        }
      }
    }
  }
};

module.exports = AccessGrantsMixin;
