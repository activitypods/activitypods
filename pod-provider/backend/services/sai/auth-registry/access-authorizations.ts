const { MoleculerError } = require('moleculer').Errors;
import { ControlledContainerMixin, arrayOf, getId, getWebIdFromUri } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import { arraysEqual } from '../../../utils.ts';
import ImmutableContainerMixin from '../../../mixins/immutable-container-mixin.ts';
import { ServiceSchema, defineAction, defineServiceEvent } from 'moleculer';

const AccessAuthorizationsSchema = {
  name: 'access-authorizations' as const,
  // @ts-expect-error TS(2322): Type '{ settings: { path: null; acceptedTypes: nul... Remove this comment to see the full error message
  mixins: [ImmutableContainerMixin, ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessAuthorization'],
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  actions: {
    generateFromAccessNeeds: defineAction({
      // Generate access authorizations from provided access needs
      async handler(ctx) {
        const { accessNeedsUris, podOwner, grantee } = ctx.params;
        let authorizationsUris = [];

        for (const accessNeedUri of arrayOf(accessNeedsUris)) {
          // Check if an access authorization already exist for this access need
          const authorization = await this.actions.getByAccessNeed({ accessNeedUri, podOwner }, { parentCtx: ctx });
          if (authorization) {
            this.logger.info(
              `Found access authorization ${getId(authorization)} linked with access need ${accessNeedUri}`
            );
            authorizationsUris.push(getId(authorization));
          } else {
            const accessNeed = await ctx.call('ldp.remote.get', { resourceUri: accessNeedUri });

            const dataRegistrationUri = await ctx.call('data-registrations.generateFromShapeTree', {
              shapeTreeUri: accessNeed['interop:registeredShapeTree'],
              podOwner
            });

            const authorizationUri = await this.actions.post(
              {
                resource: {
                  type: 'interop:AccessAuthorization',
                  'interop:dataOwner': podOwner,
                  'interop:grantedBy': podOwner,
                  'interop:grantee': grantee,
                  'interop:granteeType': 'interop:Application',
                  'interop:registeredShapeTree': accessNeed['interop:registeredShapeTree'],
                  'interop:hasDataRegistration': dataRegistrationUri,
                  'interop:accessMode': accessNeed['interop:accessMode'],
                  'interop:scopeOfAuthorization': accessNeed['interop:preferredScope'] || 'interop:All',
                  'interop:satisfiesAccessNeed': accessNeedUri
                },
                contentType: MIME_TYPES.JSON
              },
              { parentCtx: ctx }
            );

            authorizationsUris.push(authorizationUri);
          }
        }

        await this.actions.deleteOrphans({ appUri: grantee, podOwner }, { parentCtx: ctx });

        return authorizationsUris;
      }
    }),

    addForSingleResource: defineAction({
      // Add an authorization for a single resource
      async handler(ctx) {
        const { resourceUri, grantee, accessModes, delegationAllowed, delegationLimit } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.params.webId || ctx.meta.webId;

        const dataRegistration = await ctx.call('data-registrations.getByResourceUri', { resourceUri, webId });
        const dataOwner = dataRegistration['interop:registeredBy'];

        // If the user is sharing a resource they don't own, ensure they have delegation right
        if (dataOwner !== webId) {
          const grant = await ctx.call('access-grants.getByResourceUri', { resourceUri, webId });

          if (
            !grant ||
            grant['interop:delegationAllowed'] !== true ||
            (grant['interop:delegationLimit'] && grant['interop:delegationLimit'] < 1)
          ) {
            throw new MoleculerError('You are not allowed to share this resource', 403, 'FORBIDDEN');
          }
        }

        // Get existing authorizations
        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#dataOwner': dataOwner,
              'http://www.w3.org/ns/solid/interop#grantee': grantee,
              'http://www.w3.org/ns/solid/interop#hasDataRegistration': getId(dataRegistration),
              'http://www.w3.org/ns/solid/interop#scopeOfAuthorization':
                'http://www.w3.org/ns/solid/interop#SelectedFromRegistry'
            },
            webId
          },
          { parentCtx: ctx }
        );
        const authorizations = arrayOf(filteredContainer['ldp:contains']);

        // Check if a authorization was already created for this resource
        const authorizationForResource = authorizations.find(auth =>
          arrayOf(auth['interop:hasDataInstance']).includes(resourceUri)
        );

        if (authorizationForResource) {
          if (
            arraysEqual(authorizationForResource['interop:accessMode'], accessModes) &&
            delegationAllowed === authorizationForResource['interop:delegationAllowed'] &&
            delegationLimit === authorizationForResource['interop:delegationLimit']
          ) {
            // If the same access mode was granted for this resource, skip it
            this.logger.info(
              `Resource ${resourceUri} is already shared to ${grantee} with access modes ${accessModes.join(', ')}`
            );
            return getId(authorizationForResource);
          } else {
            // If the properties have changed, delete the authorization for this single resource
            // If other resources are shared with the same access authorization, they will be kept
            // Otherwise, a Delete activity will be sent and then (below) a Create activity with the new grant
            await this.actions.removeForSingleResource({ resourceUri, grantee, webId });
          }
        }

        // Check if a authorization exist with the same access modes and delegation rights
        const authorizationForAccessModes = authorizations.find(
          auth =>
            arraysEqual(arrayOf(auth['interop:accessMode']), arrayOf(accessModes)) &&
            delegationAllowed === auth['interop:delegationAllowed'] &&
            delegationLimit === auth['interop:delegationLimit']
        );

        if (authorizationForAccessModes) {
          // If a authorization exist with the same properties, add the resource
          const { resourceUri: newAuthorizationUri } = await this.actions.put(
            {
              resource: {
                ...authorizationForAccessModes,
                'interop:hasDataInstance': [
                  ...arrayOf(authorizationForAccessModes['interop:hasDataInstance']),
                  resourceUri
                ]
              },
              contentType: MIME_TYPES.JSON
            },
            { parentCtx: ctx }
          );
          return newAuthorizationUri;
        } else {
          const newAuthorizationUri = await this.actions.post(
            {
              resource: {
                type: 'interop:AccessAuthorization',
                'interop:dataOwner': dataOwner,
                'interop:grantedBy': webId,
                'interop:grantee': grantee,
                'interop:granteeType': 'interop:SocialAgent',
                'interop:registeredShapeTree': dataRegistration['interop:registeredShapeTree'],
                'interop:hasDataRegistration': getId(dataRegistration),
                'interop:hasDataInstance': resourceUri,
                'interop:accessMode': accessModes,
                'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry',
                'interop:delegationAllowed': delegationAllowed,
                'interop:delegationLimit': delegationLimit
              },
              contentType: MIME_TYPES.JSON
            },
            { parentCtx: ctx }
          );

          return newAuthorizationUri;
        }
      }
    }),

    removeForSingleResource: defineAction({
      // Remove an authorization for a single resource
      // The grantee param is optional. If provided, it will only delete authorizations for the grantee
      async handler(ctx) {
        const { resourceUri, grantee } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.params.webId || ctx.meta.webId;

        const filters = {
          'http://www.w3.org/ns/solid/interop#hasDataInstance': resourceUri,
          'http://www.w3.org/ns/solid/interop#scopeOfAuthorization':
            'http://www.w3.org/ns/solid/interop#SelectedFromRegistry'
        };
        // @ts-expect-error TS(2551): Property 'http://www.w3.org/ns/solid/interop#grant... Remove this comment to see the full error message
        if (grantee) filters['http://www.w3.org/ns/solid/interop#grantee'] = grantee;

        const filteredContainer = await this.actions.list({ filters, webId }, { parentCtx: ctx });

        for (const dataAuthorization of arrayOf(filteredContainer['ldp:contains'])) {
          const resourcesUris = arrayOf(dataAuthorization['interop:hasDataInstance']);
          if (resourcesUris.length === 1) {
            // If the resource is the only one in the authorization, delete it
            await this.actions.delete(
              {
                resourceUri: getId(dataAuthorization),
                webId
              },
              { parentCtx: ctx }
            );
          } else {
            // If other resources are in the authorization, remove it
            await this.actions.put(
              {
                resource: {
                  ...dataAuthorization,
                  'interop:hasDataInstance': resourcesUris.filter(uri => uri !== resourceUri)
                },
                contentType: MIME_TYPES.JSON,
                webId
              },
              { parentCtx: ctx }
            );
          }
        }
      }
    }),

    listForSingleResource: defineAction({
      // List all authorizations for a single resource
      async handler(ctx) {
        const { resourceUri } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.params.webId || ctx.meta.webId;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#hasDataInstance': resourceUri,
              'http://www.w3.org/ns/solid/interop#scopeOfAuthorization':
                'http://www.w3.org/ns/solid/interop#SelectedFromRegistry'
            },
            webId
          },
          { parentCtx: ctx }
        );

        return arrayOf(filteredContainer['ldp:contains']);
      }
    }),

    getByAccessNeed: defineAction({
      // Get the access authorization linked with an access need
      async handler(ctx) {
        const { accessNeedUri, podOwner } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': accessNeedUri,
              'http://www.w3.org/ns/solid/interop#dataOwner': podOwner
            },
            webId: podOwner
          },
          { parentCtx: ctx }
        );

        return arrayOf(filteredContainer['ldp:contains'])[0];
      }
    }),

    listByGrantee: defineAction({
      // Get all the access authorizations granted to an agent
      async handler(ctx) {
        const { grantee, webId } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#grantee': grantee
            },
            webId
          },
          { parentCtx: ctx }
        );

        return arrayOf(filteredContainer['ldp:contains']);
      }
    }),

    listScopeAll: defineAction({
      // List all access authorizations with `interop:All` scope
      // An optional shapeTreeUri param can be passed to filter by shape tree
      async handler(ctx) {
        const { podOwner, shapeTreeUri } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#scopeOfAuthorization': 'http://www.w3.org/ns/solid/interop#All',
              'http://www.w3.org/ns/solid/interop#registeredShapeTree': shapeTreeUri
            },
            webId: podOwner
          },
          { parentCtx: ctx }
        );

        return arrayOf(filteredContainer['ldp:contains']);
      }
    }),

    deleteOrphans: defineAction({
      // Delete authorizations which are not linked anymore to an access need (may happen on app upgrade)
      async handler(ctx) {
        const { appUri, podOwner } = ctx.params;
        const dataAuthorizations = await this.actions.listByGrantee(
          { grantee: appUri, webId: podOwner },
          { parentCtx: ctx }
        );
        for (const dataAuthorization of dataAuthorizations) {
          try {
            await ctx.call('ldp.remote.get', { resourceUri: dataAuthorization['interop:satisfiesAccessNeed'] });
          } catch (e) {
            // @ts-expect-error TS(18046): 'e' is of type 'unknown'.
            if (e.code === 404) {
              this.logger.info(
                `Deleting authorization ${dataAuthorization.id} as it is not linked anymore with an existing access need...`
              );
              await this.actions.delete({ resourceUri: dataAuthorization.id, webId: podOwner });
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
      async create(ctx, res) {
        // For migration, we don't want to handle the following side-effects
        if (ctx.meta.isMigration === true) return;

        const authorization = res.newData;
        const dataOwner = authorization['interop:dataOwner'];
        const scope = authorization['interop:scopeOfAuthorization'];
        const webId = ctx.params.webId || ctx.meta.webId;

        // Attach the to the authorization registry
        await ctx.call('auth-registry.add', {
          podOwner: webId,
          authorizationUri: getId(authorization)
        });

        // Check if we need to generate a grant or a delegated grant
        if (dataOwner === webId) {
          await ctx.call('access-grants.generateFromAuthorization', { authorization });
        } else {
          await ctx.call('delegated-access-grants.generateFromAuthorization', { authorization });
        }

        if (scope === 'interop:All') {
          // Generate delegated grants for all shared resources with the same shape tree
          const grants = await ctx.call('social-agent-registrations.getSharedGrants', {
            podOwner: dataOwner
          });
          // @ts-expect-error TS(2488): Type 'never' must have a '[Symbol.iterator]()' met... Remove this comment to see the full error message
          for (const grant of grants) {
            if (grant['interop:registeredShapeTree'] === authorization['interop:registeredShapeTree']) {
              await ctx.call('delegated-access-grants.generateFromSingleScopeAllAuthorization', {
                authorization,
                grant
              });
            }
          }
        }

        return res;
      },
      async delete(ctx, res) {
        const authorization = res.oldData;
        const dataOwner = authorization['interop:dataOwner'];
        const scope = authorization['interop:scopeOfAuthorization'];
        const webId = ctx.params.webId || ctx.meta.webId;

        // Find grant that match the authorization
        const grant =
          dataOwner === webId
            ? await ctx.call('access-grants.getByAuthorization', { authorization })
            : await ctx.call('delegated-access-grants.getByAuthorization', { authorization });

        if (grant) {
          if (dataOwner === webId) {
            await ctx.call('access-grants.delete', {
              resourceUri: getId(grant),
              webId: 'system',
              isReplacing: ctx.params.isReplacing // Forward the param
            });
          } else {
            await ctx.call('delegated-access-grants.remoteDelete', {
              delegatedGrant: grant
            });
          }
        }

        if (scope === 'interop:All') {
          // Delete delegated data grants automatically generated by "interop:All" scope authorizations
          const delegatedGrants = await ctx.call('delegated-access-grants.listByScopeAllAuthorization', {
            authorization
          });
          // @ts-expect-error TS(2488): Type 'never' must have a '[Symbol.iterator]()' met... Remove this comment to see the full error message
          for (const delegatedGrant of delegatedGrants) {
            await ctx.call('delegated-access-grants.remoteDelete', { delegatedGrant, webId });
          }
        }

        // Attach the to the authorization registry
        await ctx.call('auth-registry.remove', {
          podOwner: webId,
          authorizationUri: getId(authorization)
        });

        return res;
      }
    }
  },
  events: {
    'ldp.resource.deleted': defineServiceEvent({
      async handler(ctx) {
        // @ts-expect-error TS(2339): Property 'resourceUri' does not exist on type 'Opt... Remove this comment to see the full error message
        const { resourceUri, dataset } = ctx.params;
        const webId = getWebIdFromUri(resourceUri);

        // Delete all authorizations associated with this resource
        // @ts-expect-error TS(2339): Property 'actions' does not exist on type 'Service... Remove this comment to see the full error message
        await this.actions.removeForSingleResource({ resourceUri, webId }, { meta: { dataset }, parentCtx: ctx });
      }
    })
  }
} satisfies ServiceSchema;

export default AccessAuthorizationsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AccessAuthorizationsSchema.name]: typeof AccessAuthorizationsSchema;
    }
  }
}
