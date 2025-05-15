const { arrayOf, getId } = require('@semapps/ldp');
const { ACTIVITY_TYPES, ActivitiesHandlerMixin, matchActivity } = require('@semapps/activitypub');

/**
 * Mixin used by the DataGrantsService and DelegatedDataGrantsService
 */
const DataGrantsMixin = {
  mixins: [ActivitiesHandlerMixin],
  hooks: {
    after: {
      async create(ctx, res) {
        const dataGrant = res.newData;
        const grantee = dataGrant['interop:grantee'];
        const accessMode = arrayOf(dataGrant['interop:accessMode']);
        const scope = dataGrant['interop:scopeOfGrant'];

        // The grantee must be able to read the grant
        await ctx.call('webacl.resource.addRights', {
          resourceUri: getId(dataGrant),
          additionalRights: {
            user: {
              uri: dataGrant['interop:grantee'],
              read: true
            }
          },
          webId: 'system'
        });

        // The granter must be able to read and delete the grant
        // TODO don't do that for application data grants
        if (dataGrant['interop:grantedBy'] !== dataGrant['interop:dataOwner']) {
          await ctx.call('webacl.resource.addRights', {
            resourceUri: getId(dataGrant),
            additionalRights: {
              user: {
                uri: dataGrant['interop:grantedBy'],
                read: true,
                write: true
              }
            },
            webId: 'system'
          });
        }

        // For mapping details, see https://github.com/assemblee-virtuelle/activitypods/issues/116
        if (scope === 'interop:AllFromRegistry') {
          // Give read-write permission to the whole container
          await ctx.call('webacl.resource.addRights', {
            resourceUri: dataGrant['interop:hasDataRegistration'],
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
          for (const resourceUri of arrayOf(dataGrant['interop:hasDataInstance'])) {
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
          throw new Error(`Unknown scope ${scope} for data grant ${getId(dataGrant)}`);
        }

        const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
          actorUri: dataGrant['interop:dataOwner'],
          predicate: 'outbox'
        });

        await ctx.call(
          'activitypub.outbox.post',
          {
            collectionUri: outboxUri,
            type: ACTIVITY_TYPES.CREATE,
            object: getId(dataGrant),
            to: dataGrant['interop:grantee']
          },
          { meta: { webId: dataGrant['interop:dataOwner'] } }
        );
      },
      async delete(ctx, res) {
        const dataGrant = res.oldData;
        const appUri = dataGrant['interop:grantee'];
        const accessMode = arrayOf(dataGrant['interop:accessMode']);
        const scope = dataGrant['interop:scopeOfGrant'];

        if (scope === 'interop:AllFromRegistry') {
          await ctx.call('webacl.resource.removeRights', {
            resourceUri: containerUri,
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
          for (const resourceUri of arrayOf(dataGrant['interop:hasDataInstance'])) {
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
          throw new Error(`Unknown scope ${scope} for data grant ${getId(dataGrant)}`);
        }

        // Delete all delegated data grants generated from this data grant
        await ctx.call('delegated-data-grants.deleteByDataGrant', { dataGrant });

        const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
          actorUri: dataGrant['interop:dataOwner'],
          predicate: 'outbox'
        });

        await ctx.call(
          'activitypub.outbox.post',
          {
            collectionUri: outboxUri,
            type: ACTIVITY_TYPES.DELETE,
            object: getId(dataGrant),
            // In case of delegated data grant, send to user who created the grant ?
            to:
              dataGrant['interop:grantedBy'] !== dataGrant['interop:dataOwner']
                ? dataGrant['interop:grantedBy']
                : dataGrant['interop:grantee']
          },
          { meta: { webId: dataGrant['interop:dataOwner'] } }
        );
      }
    }
  },
  activities: {
    createDataGrant: {
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
        const dataGrant = activity.object;

        // Delete from cache the old data grant
        if (dataGrant['interop:replaces']) {
          try {
            await ctx.call('ldp.remote.delete', {
              resourceUri: dataGrant['interop:replaces'],
              webId: recipientUri
            });
          } catch (e) {
            this.logger.warn(
              `Could not delete data grant ${dataGrant['interop:replaces']} on storage of ${recipientUri}. Ignoring...`
            );
          }
        }

        // Generate delegated data grants for all data authorizations with `interop:All` scope
        const grantees = await ctx.call('delegated-data-grants.generateFromAllScopeAllDataAuthorizations', {
          dataGrant,
          podOwner: recipientUri
        });

        // Regenerate the app registrations if needed
        // TODO Also regenerate the social agent registrations
        for (const grantee of grantees) {
          await ctx.call('app-registrations.regenerate', {
            agentUri: grantee,
            podOwner: recipientUri
          });
        }
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
        const dataGrant = activity.object;

        console.log('DELETE GRANT CALLED', recipientUri, activity);
      }
    }
  }
};

module.exports = DataGrantsMixin;
