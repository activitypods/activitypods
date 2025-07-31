// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema, defineAction } from 'moleculer';

// Return true if all elements of a1 can be found on a2. Order does not matter.
const arraysEqual = (a1: any, a2: any) =>
  arrayOf(a1).length === arrayOf(a2).length && arrayOf(a1).every((i: any) => arrayOf(a2).includes(i));

// See https://solid.github.io/data-interoperability-panel/specification/#access-authorization
const AccessAuthorizationsServiceSchema = {
  name: 'access-authorizations' as const,
  mixins: [ControlledContainerMixin],

  settings: {
    acceptedTypes: ['interop:AccessAuthorization'],
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },

  actions: {
    put: defineAction({
      handler() {
        throw new Error(`The resources of type interop:AccessAuthorization are immutable`);
      }
    }),

    patch: defineAction({
      handler() {
        throw new Error(`The resources of type interop:AccessAuthorization are immutable`);
      }
    }),

    generateFromAccessNeedGroups: defineAction({
      /**
       * Generate AccessAuthorizations based on a provided list of AccessNeedGroups
       */
      async handler(ctx: any) {
        const { accessNeedGroups, acceptedAccessNeeds, acceptedSpecialRights, podOwner, appUri } = ctx.params;
        const accessAuthorizationsUris = [];

        for (const accessNeedGroupUri of arrayOf(accessNeedGroups)) {
          const accessNeedGroup = await ctx.call('ldp.remote.get', { resourceUri: accessNeedGroupUri });
          const dataAuthorizationsUris = [];
          const specialRightsUris = [];

          if (acceptedAccessNeeds) {
            for (const accessNeedUri of arrayOf(accessNeedGroup['interop:hasAccessNeed'])) {
              if (acceptedAccessNeeds.includes(accessNeedUri)) {
                dataAuthorizationsUris.push(
                  await ctx.call('data-authorizations.generateFromAccessNeed', { accessNeedUri, podOwner, appUri })
                );
              }
            }
          }

          if (acceptedSpecialRights) {
            for (const specialRightUri of arrayOf(accessNeedGroup['apods:hasSpecialRights'])) {
              if (acceptedSpecialRights.includes(specialRightUri)) {
                specialRightsUris.push(specialRightUri);
              }
            }
          }

          // Check if an access grant already exist for this AccessNeedGroup
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ put()... Remove this comment to see the full error message
          const accessAuthorization = await this.actions.getByAccessNeedGroup(
            { accessNeedGroupUri, podOwner },
            { parentCtx: ctx }
          );

          // Only created the corresponding AccessAuthorization if a right was granted
          if (dataAuthorizationsUris.length > 0 || specialRightsUris.length > 0) {
            if (
              accessAuthorization &&
              arraysEqual(accessAuthorization['interop:hasDataAuthorization'], dataAuthorizationsUris) &&
              arraysEqual(accessAuthorization['apods:hasSpecialRights'], specialRightsUris)
            ) {
              // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ put():... Remove this comment to see the full error message
              this.logger.info(
                `Found access authorization ${accessAuthorization.id} linked with access need group ${accessNeedGroupUri}`
              );
              accessAuthorizationsUris.push(accessAuthorization.id);
            } else {
              if (accessAuthorization) {
                // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ put():... Remove this comment to see the full error message
                this.logger.info(
                  `Deleting access authorization ${accessAuthorization.id} before recreating one as it does not grant the same rights`
                );
                // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ put()... Remove this comment to see the full error message
                await this.actions.delete({ resourceUri: accessAuthorization.id, webId: podOwner });
              }
              accessAuthorizationsUris.push(
                // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ put()... Remove this comment to see the full error message
                await this.actions.post(
                  {
                    resource: {
                      type: 'interop:AccessAuthorization',
                      'interop:grantedBy': podOwner,
                      'interop:grantedWith': await ctx.call('auth-agent.getResourceUri', { webId: podOwner }),
                      'interop:grantedAt': new Date().toISOString(),
                      'interop:grantee': appUri,
                      'interop:hasAccessNeedGroup': accessNeedGroupUri,
                      'interop:hasDataAuthorization': dataAuthorizationsUris,
                      'apods:hasSpecialRights': specialRightsUris
                    },
                    contentType: MIME_TYPES.JSON
                  },
                  { parentCtx: ctx }
                )
              );
            }
          } else if (accessAuthorization) {
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ put():... Remove this comment to see the full error message
            this.logger.info(
              `Deleting access authorization ${accessAuthorization.id} as no related access needs were granted`
            );
            // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ put()... Remove this comment to see the full error message
            await this.actions.delete({ resourceUri: accessAuthorization.id, webId: podOwner });
          }
        }
      }
    }),

    getForApp: defineAction({
      // Get all the AccessAuthorizations granted to an application
      // @ts-expect-error TS(7023): 'getForApp' implicitly has return type 'any' becau... Remove this comment to see the full error message
      async handler(ctx: any) {
        const { appUri, podOwner } = ctx.params;

        // @ts-expect-error TS(7022): 'containerUri' implicitly has type 'any' because i... Remove this comment to see the full error message
        const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });

        // @ts-expect-error TS(7022): 'filteredContainer' implicitly has type 'any' beca... Remove this comment to see the full error message
        const filteredContainer = await this.actions.list(
          {
            containerUri,
            filters: {
              'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
              'http://www.w3.org/ns/solid/interop#grantee': appUri
            },
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        return arrayOf(filteredContainer['ldp:contains']);
      }
    }),

    getByAccessNeedGroup: defineAction({
      // Get the AccessAuthorization linked with an AccessNeedGroup
      // @ts-expect-error TS(7023): 'getByAccessNeedGroup' implicitly has return type ... Remove this comment to see the full error message
      async handler(ctx: any) {
        const { accessNeedGroupUri, podOwner } = ctx.params;

        // @ts-expect-error TS(7022): 'filteredContainer' implicitly has type 'any' beca... Remove this comment to see the full error message
        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
              'http://www.w3.org/ns/solid/interop#hasAccessNeedGroup': accessNeedGroupUri
            },
            webId: podOwner
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.[0];
      }
    }),

    getSpecialRights: defineAction({
      // Get all the special rights granted to an application
      // @ts-expect-error TS(7023): 'getSpecialRights' implicitly has return type 'any... Remove this comment to see the full error message
      async handler(ctx: any) {
        const { appUri, podOwner } = ctx.params;

        // @ts-expect-error TS(7022): 'accessAuthorizations' implicitly has type 'any' b... Remove this comment to see the full error message
        const accessAuthorizations = await this.actions.getForApp({ appUri, podOwner }, { parentCtx: ctx });

        return accessAuthorizations.reduce((acc: any, cur: any) => {
          if (cur['apods:hasSpecialRights']) acc.push(...arrayOf(cur['apods:hasSpecialRights']));
          return acc;
        }, []);
      }
    }),

    addPermissionsFromSpecialRights: defineAction({
      async handler(ctx: any) {
        const { podOwner, appUri, specialRightsUris } = ctx.params;

        // Give read permissions on all activities, if requested
        if (specialRightsUris.includes('apods:ReadInbox') || specialRightsUris.includes('apods:ReadOutbox')) {
          await ctx.call('webacl.resource.addRights', {
            resourceUri: await ctx.call('activitypub.activity.getContainerUri', { webId: podOwner }),
            additionalRights: {
              default: {
                user: {
                  uri: appUri,
                  read: true
                }
              }
            },
            webId: 'system'
          });
        }

        // Give update permission on user's webId, if requested
        if (specialRightsUris.includes('apods:UpdateWebId')) {
          await ctx.call('webacl.resource.addRights', {
            resourceUri: podOwner,
            additionalRights: {
              user: {
                uri: appUri,
                write: true
              }
            },
            webId: 'system'
          });
        }

        // Give read/write permissions on all existing collections
        // plus permission to create collection, if it was requested
        await ctx.call('webacl.resource.addRights', {
          resourceUri: await ctx.call('activitypub.collection.getContainerUri', { webId: podOwner }),
          additionalRights: {
            default: {
              user: {
                uri: appUri,
                read: true,
                write: true
              }
            },
            user: specialRightsUris.includes('apods:CreateCollection')
              ? {
                  uri: appUri,
                  write: true
                }
              : undefined
          },
          webId: 'system'
        });

        // Give read/write permissions on the files container
        await ctx.call('webacl.resource.addRights', {
          resourceUri: await ctx.call('files.getContainerUri', { webId: podOwner }),
          additionalRights: {
            user: {
              uri: appUri,
              write: true
            },
            default: {
              user: {
                uri: appUri,
                read: true,
                write: true
              }
            }
          },
          webId: 'system'
        });
      }
    }),

    removePermissionsFromSpecialRights: defineAction({
      async handler(ctx: any) {
        const { podOwner, appUri, specialRightsUris } = ctx.params;

        // Remove read permissions on all activities, if requested
        if (specialRightsUris.includes('apods:ReadInbox') || specialRightsUris.includes('apods:ReadOutbox')) {
          await ctx.call('webacl.resource.removeRights', {
            resourceUri: await ctx.call('activitypub.activity.getContainerUri', { webId: podOwner }),
            rights: {
              default: {
                user: {
                  uri: appUri,
                  read: true
                }
              }
            },
            webId: 'system'
          });
        }

        // Remove update permission on user's webId, if requested
        if (specialRightsUris.includes('apods:UpdateWebId')) {
          await ctx.call('webacl.resource.removeRights', {
            resourceUri: podOwner,
            rights: {
              user: {
                uri: appUri,
                write: true
              }
            },
            webId: 'system'
          });
        }

        // Remove read/write permissions on all existing collections
        // plus permission to create collection, if it was requested
        await ctx.call('webacl.resource.removeRights', {
          resourceUri: await ctx.call('activitypub.collection.getContainerUri', { webId: podOwner }),
          rights: {
            default: {
              user: {
                uri: appUri,
                read: true,
                write: true
              }
            },
            user: specialRightsUris.includes('apods:CreateCollection')
              ? {
                  uri: appUri,
                  write: true
                }
              : undefined
          },
          webId: 'system'
        });

        // Remove read/write permissions on the files container
        await ctx.call('webacl.resource.removeRights', {
          resourceUri: await ctx.call('files.getContainerUri', { webId: podOwner }),
          rights: {
            default: {
              user: {
                uri: appUri,
                read: true,
                write: true
              }
            }
          },
          webId: 'system'
        });
      }
    }),

    deleteOrphans: defineAction({
      // Delete AccessAuthorizations which are not linked to an AccessNeedGroup (may happen on app upgrade)
      async handler(ctx: any) {
        const { appUri, podOwner } = ctx.params;
        // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ put()... Remove this comment to see the full error message
        const accessAuthorizations = await this.actions.getForApp({ appUri, podOwner }, { parentCtx: ctx });
        for (const accessAuthorization of accessAuthorizations) {
          try {
            await ctx.call('ldp.remote.get', { resourceUri: accessAuthorization['interop:hasAccessNeedGroup'] });
          } catch (e) {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            if (e.code === 404) {
              // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ put():... Remove this comment to see the full error message
              this.logger.info(
                `Deleting access authorization ${accessAuthorization.id} as it is not linked anymore with an existing access need group...`
              );
              // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ put()... Remove this comment to see the full error message
              await this.actions.delete({ resourceUri: accessAuthorization.id, webId: podOwner });
            } else {
              throw e;
            }
          }
        }
      }
    })
  },

  hooks: {
    after: {
      async post(ctx: any, res: any) {
        const podOwner = ctx.params.resource['interop:grantedBy'];

        // Attach the AccessAuthorization to the AuthorizationRegistry
        await ctx.call('auth-registry.add', {
          podOwner,
          accessAuthorizationUri: res
        });

        // For migration, we don't want this to go further
        if (ctx.meta.isMigration === true) return;

        // Add permissions based on the special rights
        // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ post(... Remove this comment to see the full error message
        await this.actions.addPermissionsFromSpecialRights(
          {
            podOwner,
            appUri: ctx.params.resource['interop:grantee'],
            specialRightsUris: arrayOf(ctx.params.resource['apods:hasSpecialRights'])
          },
          { parentCtx: ctx }
        );

        // Get DataGrants corresponding to DataAuthorizations
        const dataGrantsUris = [];
        for (const dataAuthorizationUri of arrayOf(ctx.params.resource['interop:hasDataAuthorization'])) {
          dataGrantsUris.push(await ctx.call('data-grants.getByDataAuthorization', { dataAuthorizationUri, podOwner }));
        }

        // Create a AccessGrant with the same data, except interop:grantedWith and interop:hasDataAuthorization
        await ctx.call('access-grants.post', {
          resource: {
            ...ctx.params.resource,
            type: 'interop:AccessGrant',
            'interop:grantedWith': undefined,
            'interop:hasDataAuthorization': undefined,
            'interop:hasDataGrant': dataGrantsUris
          },
          contentType: MIME_TYPES.JSON
        });

        return res;
      },
      // Mirror of the above hook
      async delete(ctx: any, res: any) {
        // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ post(... Remove this comment to see the full error message
        await this.actions.removePermissionsFromSpecialRights(
          {
            podOwner: res.oldData['interop:grantedBy'],
            appUri: res.oldData['interop:grantee'],
            specialRightsUris: arrayOf(res.oldData['apods:hasSpecialRights'])
          },
          { parentCtx: ctx }
        );

        // Detach the AccessAuthorization from the AuthorizationRegistry
        await ctx.call('auth-registry.remove', {
          podOwner: res.oldData['interop:grantedBy'],
          accessAuthorizationUri: res.resourceUri
        });

        // Delete AccessGrant that match the same AccessNeedGroup
        const accessGrant = await ctx.call('access-grants.getByAccessNeedGroup', {
          accessNeedGroupUri: res.oldData['interop:hasAccessNeedGroup'],
          podOwner: res.oldData['interop:grantedBy']
        });
        if (accessGrant) {
          await ctx.call('access-grants.delete', {
            resourceUri: accessGrant.id,
            webId: 'system'
          });
        }

        return res;
      }
    }
  }
} satisfies ServiceSchema;

export default AccessAuthorizationsServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AccessAuthorizationsServiceSchema.name]: typeof AccessAuthorizationsServiceSchema;
    }
  }
}
