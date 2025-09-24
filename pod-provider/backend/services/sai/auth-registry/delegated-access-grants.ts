import { ServiceSchema } from 'moleculer';
import { ControlledContainerMixin, arrayOf, getId, getDatasetFromUri } from '@semapps/ldp';
import { ACTIVITY_TYPES } from '@semapps/activitypub';
import ImmutableContainerMixin from '../../../mixins/immutable-container-mixin.ts';
import AccessGrantsMixin from '../../../mixins/access-grants.ts';
import { arraysEqual } from '../../../utils.ts';

const DelegatedAccessGrantsSchema = {
  name: 'delegated-access-grants' as const,
  mixins: [ImmutableContainerMixin, ControlledContainerMixin, AccessGrantsMixin],
  settings: {
    acceptedTypes: ['interop:DelegatedAccessGrant'],
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  actions: {
    remoteIssue: {
      // Issue a delegated grant on the data owner's storage
      // Also store a local copy and add it to the agent registration
      async handler(ctx) {
        let { delegatedGrant } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.params.webId || ctx.meta.webId || 'anon';
        let delegatedGrantUri;

        const dataOwnerUri = delegatedGrant['interop:dataOwner'];
        const baseUrl = await ctx.call('ldp.getBaseUrl');

        // If user is on same server, call endpoint directly
        if (dataOwnerUri.startsWith(baseUrl)) {
          // Change dataset but keep it in memory to restore it
          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          const oldDataset = ctx.meta.dataset;
          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          ctx.meta.dataset = getDatasetFromUri(dataOwnerUri);

          delegatedGrantUri = await ctx.call('delegation-endpoint.issue', { delegatedGrant, webId });

          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          ctx.meta.dataset = oldDataset;
        } else {
          const dataOwner = await ctx.call('activitypub.actor.get', { actorUri: dataOwnerUri });

          if (!dataOwner['interop:hasAuthorizationAgent'])
            throw new Error(`Data owner ${dataOwnerUri} has no authorization agent`);

          const authorizationAgent = await ctx.call('authorization-agent.get', {
            resourceUri: dataOwner['interop:hasAuthorizationAgent']
          });

          if (!authorizationAgent['interop:hasDelegationIssuanceEndpoint'])
            throw new Error(`Data owner ${dataOwnerUri} has no delegation issuance endpoint`);

          const response = await ctx.call('signature.proxy.query', {
            url: authorizationAgent['interop:hasDelegationIssuanceEndpoint'],
            method: 'POST',
            headers: {
              'Content-Type': 'application/ld+json'
            },
            body: JSON.stringify(delegatedGrant),
            actorUri: webId
          });

          if (response.status === 201) {
            delegatedGrantUri = response.headers.get('Location');
          } else {
            throw new Error(
              `Could not fetch ${authorizationAgent['interop:hasDelegationIssuanceEndpoint']}. Response code: ${response.status}`
            );
          }
        }

        // Now the delegated grant has been created and validated, store it locally
        delegatedGrant = await ctx.call('ldp.remote.store', { resourceUri: delegatedGrantUri, webId });
        await this.actions.attach({ resourceUri: delegatedGrantUri, webId }, { parentCtx: ctx });

        // Attach it to the agent registration
        if (delegatedGrant['interop:granteeType'] === 'interop:Application') {
          await ctx.call('app-registrations.addGrant', { grant: delegatedGrant });
        } else {
          await ctx.call('social-agent-registrations.addGrant', { grant: delegatedGrant });
        }

        return delegatedGrantUri;
      }
    },

    remoteDelete: {
      // Delete a delegated grant on the data owner's storage
      // Also delete the local copy and remove it from the agent registration
      async handler(ctx) {
        const { delegatedGrant } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.params.webId || ctx.meta.webId || 'anon';

        const delegatedGrantUri = getId(delegatedGrant);
        const dataOwnerUri = delegatedGrant['interop:dataOwner'];
        const baseUrl = await ctx.call('ldp.getBaseUrl');

        // If user is on same server, delete directly
        if (dataOwnerUri.startsWith(baseUrl)) {
          // Change dataset but keep it in memory to restore it
          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          const oldDataset = ctx.meta.dataset;
          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          ctx.meta.dataset = getDatasetFromUri(dataOwnerUri);

          try {
            await ctx.call(
              'ldp.resource.delete',
              { resourceUri: delegatedGrantUri, webId: dataOwnerUri },
              { parentCtx: ctx }
            );
          } catch (e) {
            this.logger.warn(`Could not delete delegated grant ${delegatedGrantUri}. Deleting local cache anyway.`);
          }

          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          ctx.meta.dataset = oldDataset;
        } else {
          const response = await ctx.call('signature.proxy.query', {
            url: delegatedGrantUri,
            method: 'DELETE',
            actorUri: webId
          });

          if (response.status !== 204) {
            this.logger.warn(`Could not delete delegated grant ${delegatedGrantUri}. Deleting local cache anyway.`);
          }
        }

        // Now the delegated access grant has been deleted, delete the local cache
        await ctx.call('ldp.remote.delete', { resourceUri: delegatedGrantUri, webId });
        await this.actions.detach({ resourceUri: delegatedGrantUri, webId }, { parentCtx: ctx });

        // Detach it from the agent registration
        if (delegatedGrant['interop:granteeType'] === 'interop:Application') {
          await ctx.call('app-registrations.removeGrant', { grant: delegatedGrant });
        } else {
          await ctx.call('social-agent-registrations.removeGrant', { grant: delegatedGrant });
        }
      }
    },

    generateFromAllScopeAllAuthorizations: {
      // Generate the delegated access grants from all access authorizations with `interop:All` scope
      async handler(ctx) {
        const { grant, podOwner } = ctx.params;

        const authorizations = await ctx.call('access-authorizations.listScopeAll', {
          podOwner,
          shapeTreeUri: grant['interop:registeredShapeTree']
        });

        for (const authorization of authorizations) {
          await ctx.call('delegated-access-grants.generateFromSingleScopeAllAuthorization', {
            authorization,
            grant
          });
        }
      }
    },

    generateFromSingleScopeAllAuthorization: {
      // Generate a delegated access grant from a single access authorization with `interop:All` scope
      // If a delegated grant already exist but is linked to a different grant, it will be deleted
      async handler(ctx) {
        const { authorization, grant } = ctx.params;

        if (authorization['interop:scopeOfAuthorization'] !== 'interop:All') {
          throw new Error(
            `The scope of access authorization ${authorization.id} must be 'interop:All' (Received: ${authorization['interop:scopeOfAuthorization']})`
          );
        }

        if (authorization['interop:registeredShapeTree'] !== grant['interop:registeredShapeTree']) {
          throw new Error(
            `The shape tree of the access authorization (${authorization['interop:registeredShapeTree']}) is not the same as the one of the access grant (${grant['interop:registeredShapeTree']})`
          );
        }

        // Get all delegated grants generated from this authorization
        const delegatedGrants = await ctx.call('delegated-access-grants.listByScopeAllAuthorization', {
          authorization
        });

        // Find if a delegated grant already exist for this social agent
        const delegatedGrant = delegatedGrants.find(
          (ddg: any) => ddg['interop:dataOwner'] === grant['interop:dataOwner']
        );

        if (delegatedGrant) {
          if (delegatedGrant['interop:delegationOfGrant'] === grant.id) {
            this.logger.info(`Access grant ${grant.id} has not changed, skipping generation of delegated grant...`);
          } else {
            this.logger.info(`Access grant ${grant.id} has been updated, regenerating the delegated grant...`);

            await this.actions.remoteDelete({ delegatedGrant }, { parentCtx: ctx });

            await this.actions.remoteIssue(
              {
                delegatedGrant: {
                  ...delegatedGrant,
                  id: undefined,
                  'interop:hasDataInstance': grant['interop:hasDataInstance'],
                  'interop:delegationOfGrant': getId(grant)
                }
              },
              { parentCtx: ctx }
            );
          }
        } else {
          this.logger.info(`Access grant ${grant.id} has no associated delegated access grant, generating...`);

          await this.actions.remoteIssue(
            {
              delegatedGrant: {
                ...grant,
                id: undefined,
                type: 'interop:DelegatedAccessGrant',
                'interop:grantee': authorization['interop:grantee'],
                'interop:granteeType': authorization['interop:granteeType'],
                'interop:grantedBy': authorization['interop:grantedBy'],
                'interop:satisfiesAccessNeed': authorization['interop:satisfiesAccessNeed'],
                'interop:delegationOfGrant': getId(grant)
              }
            },
            { parentCtx: ctx }
          );
        }
      }
    },

    generateFromAuthorization: {
      async handler(ctx) {
        const { authorization } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.params.webId || ctx.meta.webId;

        // Find original grant (it should be stored in the user's local cache)
        const grantsContainer = await ctx.call('access-grants.list', {
          filters: {
            'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': authorization['interop:satisfiesAccessNeed'],
            'http://www.w3.org/ns/solid/interop#dataOwner': authorization['interop:dataOwner'],
            'http://www.w3.org/ns/solid/interop#hasDataRegistration': authorization['interop:hasDataRegistration']
          },
          webId
        });
        const grant = grantsContainer['ldp:contains']?.[0];
        if (!grant) throw new Error(`Could not find grant generated from authorization ${getId(authorization)}`);

        const delegationAllowed =
          grant['interop:delegationAllowed'] &&
          (grant['interop:delegationLimit'] === undefined || grant['interop:delegationLimit'] > 1);

        const delegateGrantUri = await this.actions.remoteIssue(
          {
            delegatedGrant: {
              // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
              ...grant,
              id: undefined,
              type: 'interop:DelegatedAccessGrant',
              'interop:grantee': authorization['interop:grantee'],
              'interop:granteeType': authorization['interop:granteeType'],
              'interop:grantedBy': webId,
              'interop:delegationOfGrant': getId(grant),
              'interop:delegationAllowed': delegationAllowed ? true : undefined,
              'interop:delegationLimit':
                delegationAllowed && grant['interop:delegationLimit'] ? grant['interop:delegationLimit'] - 1 : undefined
            }
          },
          { parentCtx: ctx }
        );

        // Notify the grantee of the delegated grant, so that they may put it in cache
        const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
          actorUri: webId,
          predicate: 'outbox'
        });
        await ctx.call('activitypub.outbox.post', {
          collectionUri: outboxUri,
          type: ACTIVITY_TYPES.CREATE,
          object: delegateGrantUri,
          to: authorization['interop:grantee'],
          transient: true
        });

        return delegateGrantUri;
      }
    },

    deleteByGrant: {
      // Delete all delegated access grants linked with a access grant
      async handler(ctx) {
        const { grant } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.params.webId || ctx.meta.webId || 'anon';

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#delegationOfGrant': getId(grant)
            },
            webId
          },
          { parentCtx: ctx }
        );

        for (const delegatedGrant of arrayOf(filteredContainer['ldp:contains'])) {
          if (await ctx.call('ldp.remote.isRemote', { resourceUri: getId(delegatedGrant) })) {
            await this.actions.remoteDelete({ delegatedGrant, webId }, { parentCtx: ctx });
          } else {
            await this.actions.delete({ resourceUri: getId(delegatedGrant) }, { parentCtx: ctx });
          }
        }
      }
    },

    getByGrant: {
      // Get the delegated access grant generated for a grantee from a access grant
      async handler(ctx) {
        const { grantUri, grantee, podOwner } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#delegationOfGrant': grantUri,
              'http://www.w3.org/ns/solid/interop#grantee': grantee
            },
            webId: podOwner
          },
          { parentCtx: ctx }
        );

        return arrayOf(filteredContainer['ldp:contains'])[0];
      }
    },

    getByAuthorization: {
      // Find the delegated access grants, stored in the granter storage
      async handler(ctx) {
        const { authorization } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#dataOwner': authorization['interop:dataOwner'],
              'http://www.w3.org/ns/solid/interop#grantee': authorization['interop:grantee'],
              'http://www.w3.org/ns/solid/interop#grantedBy': authorization['interop:grantedBy'],
              'http://www.w3.org/ns/solid/interop#hasDataRegistration': authorization['interop:hasDataRegistration']
            },
            webId: authorization['interop:grantedBy']
          },
          { parentCtx: ctx }
        );

        if (
          filteredContainer['ldp:contains'].length > 1 &&
          authorization['interop:scopeOfAuthorization'] === 'interop:SelectedFromRegistry'
        ) {
          // If the authorization is for selected data instances, find the grant that match the same data instances
          // We cannot use the `filters` parameter above because it does not work with arrays
          return filteredContainer['ldp:contains'].find((grant: any) =>
            arraysEqual(authorization['interop:hasDataInstance'], grant['interop:hasDataInstance'])
          );
        } else {
          return filteredContainer['ldp:contains']?.[0];
        }
      }
    },

    listByScopeAllAuthorization: {
      // Get the delegated access grants generated automatically from a `interop:All` access authorization
      async handler(ctx) {
        const { authorization } = ctx.params;

        if (authorization['interop:scopeOfAuthorization'] !== 'interop:All') {
          throw new Error(
            `The scope of access authorization ${authorization.id} must be 'interop:All' (Received: ${authorization['interop:scopeOfAuthorization']})`
          );
        }

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#registeredShapeTree': authorization['interop:registeredShapeTree'],
              'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': authorization['interop:satisfiesAccessNeed'],
              'http://www.w3.org/ns/solid/interop#grantee': authorization['interop:grantee'],
              'http://www.w3.org/ns/solid/interop#grantedBy': authorization['interop:grantedBy']
            },
            webId: authorization['interop:dataOwner']
          },
          { parentCtx: ctx }
        );

        return arrayOf(filteredContainer['ldp:contains']);
      }
    }
  }
} satisfies ServiceSchema;

export default DelegatedAccessGrantsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [DelegatedAccessGrantsSchema.name]: typeof DelegatedAccessGrantsSchema;
    }
  }
}
