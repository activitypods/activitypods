// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { Errors as E } from 'moleculer';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { arrayOf, hasType, getWebIdFromUri, getParentContainerUri } from '@semapps/ldp';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { FULL_ACTIVITY_TYPES, FULL_ACTOR_TYPES } from '@semapps/activitypub';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';

const DEFAULT_ALLOWED_TYPES = [
  ...Object.values(FULL_ACTOR_TYPES),
  ...Object.values(FULL_ACTIVITY_TYPES),
  'Collection',
  'OrderedCollection',
  'CollectionPage',
  'OrderedCollectionPage',
  'Tombstone',
  'semapps:File',
  'acl:Authorization',
  'notify:WebSocketChannel2023',
  'notify:WebhookChannel2023'
];

// TODO use cache to improve performances
const getAllowedTypes = async (ctx: any, appUri: any, podOwner: any, accessMode: any) => {
  const dataAuthorizations = await ctx.call('data-authorizations.getForApp', { appUri, podOwner });

  let types = [...DEFAULT_ALLOWED_TYPES];
  for (const dataAuthorization of dataAuthorizations) {
    if (arrayOf(dataAuthorization['interop:accessMode']).includes(accessMode)) {
      const shapeUri = await ctx.call('shape-trees.getShapeUri', {
        resourceUri: dataAuthorization['interop:registeredShapeTree']
      });
      // Binary resources don't have a shape
      if (shapeUri) {
        types.push(...(await ctx.call('shacl.getTypes', { resourceUri: shapeUri })));
      }
    }
  }

  return await ctx.call('jsonld.parser.expandTypes', { types });
};

const AppControlMiddleware = ({ baseUrl }: any) => ({
  name: 'AppControlMiddleware',
  async started() {
    if (!baseUrl) throw new Error('The baseUrl config is missing for the AppControlMiddleware');
  },
  localAction: (next: any, action: any) => {
    if (action.name === 'signature.proxy.api_query') {
      return async (ctx: any) => {
        const podOwner = urlJoin(baseUrl, ctx.params.username);
        const url = ctx.params.id;

        // Bypass checks if user is querying his own pod
        if (ctx.meta.webId === podOwner) {
          return next(ctx);
        }

        const appUri = ctx.meta.webId;
        const { origin: appBaseUrl } = new URL(appUri);

        // Bypass checks if user is querying the app backend
        // Can happen if the app needs the user to be authenticated
        if (url.startsWith(appBaseUrl)) {
          ctx.meta.webId = podOwner;
          return next(ctx);
        }

        // Ensure we are fetching remote data (otherwise this could be a security issue)
        if (url.startsWith(podOwner)) {
          throw new E.ForbiddenError(`The proxy cannot be used to fetch local data`);
        }

        // Ensure the webId is a registered application
        if (!(await ctx.call('app-registrations.isRegistered', { appUri, podOwner }))) {
          throw new E.ForbiddenError(`Only registered applications may fetch the proxy endpoint`);
        }

        // Ensure the application has the right to modify this resource
        if (ctx.params.method === 'PUT' || ctx.params.method === 'DELETE') {
          let resourceTypes = [];
          try {
            // Fetch the resource to have its type
            const resource = await ctx.call('ldp.remote.get', { resourceUri: url, webId: podOwner });
            resourceTypes = await ctx.call('jsonld.parser.expandTypes', {
              types: resource.type || resource['@type'],
              context: resource['@context']
            });
          } catch (e) {
            // If we can't GET the resource, we won't authorize the call to the proxy
            throw new E.ForbiddenError(`No ${ctx.params.method} call is allowed on the URL ${url}`);
          }

          const allowedTypes = await getAllowedTypes(ctx, appUri, podOwner, 'acl:Write');

          if (!resourceTypes.some((t: any) => allowedTypes.includes(t))) {
            throw new E.ForbiddenError(
              `The type of the resource being modified (${resourceTypes.join(', ')}) doesn't match any authorized types`
            );
          }
        }

        // Ensure the application has the right to create this resource
        if (ctx.params.method === 'POST') {
          const resource = JSON.parse(ctx.params.body);

          const resourceTypes = await ctx.call('jsonld.parser.expandTypes', {
            types: resource.type || resource['@type'],
            context: resource['@context']
          });

          const allowedTypes = await getAllowedTypes(ctx, appUri, podOwner, 'acl:Write');

          if (!resourceTypes.some((t: any) => allowedTypes.includes(t))) {
            throw new E.ForbiddenError(
              `Some of the resources' types being posted (${resourceTypes.join(', ')}) are not authorized`
            );
          }
        }

        // Impersonate the user so that signature.proxy.api_query can be called
        ctx.meta.webId = podOwner;

        const result = await next(ctx);

        ctx.meta.webId = appUri;

        // Check if the application has the right to read this type of data
        if (result && ctx.params.method === 'GET') {
          const allowedTypes = await getAllowedTypes(ctx, appUri, podOwner, 'acl:Read');

          // TODO If the resource is a LDP container, ensure that all contained resources types are allowed
          let resourceTypes = result['@graph']
            ? [].concat(result['@graph'].map((r: any) => r.type || r['@type']))
            : result.type || result['@type'];

          resourceTypes = await ctx.call('jsonld.parser.expandTypes', {
            types: arrayOf(resourceTypes),
            context: result['@context']
          });

          if (resourceTypes.length > 0 && !resourceTypes.some((t: any) => allowedTypes.includes(t))) {
            throw new E.ForbiddenError(
              `Some of the resources' types being fetched (${resourceTypes.join(', ')}) are not authorized`
            );
          }
        }

        return result;
      };
    } else if (action.name === 'activitypub.outbox.post') {
      return async (ctx: any) => {
        const { collectionUri, ...activity } = ctx.params;
        const podOwner = getParentContainerUri(collectionUri);

        // Bypass checks if user is posting to their outbox
        if (ctx.meta.webId === podOwner) {
          return next(ctx);
        }

        const appUri = ctx.meta.webId;

        // Ensure the webId is a registered application
        if (!(await ctx.call('app-registrations.isRegistered', { appUri, podOwner }))) {
          throw new E.ForbiddenError(`Only registered applications may post to the user outbox`);
        }

        const specialRights = await ctx.call('access-authorizations.getSpecialRights', { appUri, podOwner });
        if (!specialRights.includes('apods:PostOutbox')) {
          throw new E.ForbiddenError(`The application has no permission to post to the outbox (apods:PostOutbox)`);
        }

        if (hasType(activity, 'Create') || hasType(activity, 'Update') || hasType(activity, 'Delete')) {
          const allowedTypes = await getAllowedTypes(ctx, appUri, podOwner, 'acl:Write');
          let resourceTypes;

          if (hasType(activity, 'Create')) {
            resourceTypes = await ctx.call('jsonld.parser.expandTypes', {
              types: activity.object.type || activity.object['@type'],
              context: activity['@context']
            });
          } else {
            try {
              const resource = await ctx.call('ldp.resource.get', {
                resourceUri: activity.object.id || activity.object['@id'],
                accept: MIME_TYPES.JSON,
                webId: 'system'
              });

              resourceTypes = await ctx.call('jsonld.parser.expandTypes', {
                types: resource.type || resource['@type'],
                context: activity['@context']
              });
            } catch (e) {
              throw new E.ForbiddenError(`The resource ${activity.object.id || activity.object['@id']} doesn't exist`);
            }
          }

          if (!resourceTypes.some((t: any) => allowedTypes.includes(t))) {
            throw new E.ForbiddenError(`The type of the resource doesn't match any authorized types`);
          }
        }

        // Impersonate the user so that signature.proxy.api_query can be called
        ctx.meta.webId = podOwner;

        ctx.params.generator = appUri;

        return await next(ctx);
      };
    } else if (action.name === 'webacl.group.api_create') {
      return async (ctx: any) => {
        const { username } = ctx.params;
        const podOwner = urlJoin(baseUrl, username);

        // Bypass checks if user is acting on their own pod
        if (ctx.meta.webId === podOwner) {
          return next(ctx);
        }

        const appUri = ctx.meta.webId;

        // Ensure the webId is a registered application
        if (!(await ctx.call('app-registrations.isRegistered', { appUri, podOwner }))) {
          throw new E.ForbiddenError(`Only registered applications may handle ACL groups`);
        }

        const specialRights = await ctx.call('access-authorizations.getSpecialRights', { appUri, podOwner });
        if (!specialRights.includes('apods:CreateWacGroup')) {
          throw new E.ForbiddenError(`The application has no permission to handle ACL groups (apods:CreateWacGroup)`);
        }

        return await next(ctx);
      };
    } else if (action.name === 'webacl.group.api_addMember') {
      return async (ctx: any) => {
        const { username } = ctx.params;
        const podOwner = urlJoin(baseUrl, username);

        // Bypass checks if user is acting on their own Pod
        if (ctx.meta.webId === podOwner) {
          return next(ctx);
        }

        // If the webId is a registered application, use the system webId to bypass WAC checks
        if (await ctx.call('app-registrations.isRegistered', { appUri: ctx.meta.webId, podOwner })) {
          const appUri = ctx.meta.webId;

          const specialRights = await ctx.call('access-authorizations.getSpecialRights', { appUri, podOwner });
          if (!specialRights.includes('apods:CreateWacGroup')) {
            throw new E.ForbiddenError(`The application has no permission to handle ACL groups (apods:CreateWacGroup)`);
          }

          ctx.meta.webId = 'system';

          const result = await next(ctx);

          ctx.meta.webId = appUri;

          return result;
        } else {
          return await next(ctx);
        }
      };
    } else if (action.name === 'sparqlEndpoint.query') {
      return async (ctx: any) => {
        const { username } = ctx.params;
        const podOwner = urlJoin(baseUrl, username);

        // Bypass checks if user is acting on their own
        if (ctx.meta.webId === podOwner) {
          return next(ctx);
        }

        // If the webId is a registered application, check it has the special right
        if (
          ctx.meta.webId !== 'anon' &&
          ctx.meta.webId !== 'system' &&
          (await ctx.call('app-registrations.isRegistered', { appUri: ctx.meta.webId, podOwner }))
        ) {
          const appUri = ctx.meta.webId;

          const specialRights = await ctx.call('access-authorizations.getSpecialRights', { appUri, podOwner });
          if (!specialRights.includes('apods:QuerySparqlEndpoint')) {
            throw new E.ForbiddenError(
              `The application has no permission to query the SPARQL endpoint (apods:QuerySparqlEndpoint)`
            );
          }

          // Temporarily disable WAC permissions check on public SPARQL endpoint to see how it impacts performances
          // (In the WebaclMiddleware, for all triplestore actions, we set the webId to "system" if the webId is the Pod owner)
          ctx.meta.webId = podOwner;
        }

        return next(ctx);
      };
    } else if (action.name === 'activitypub.collection.get') {
      return async (ctx: any) => {
        const { resourceUri: collectionUri } = ctx.params;
        const podOwner = getWebIdFromUri(collectionUri);

        // Bypass checks if user is acting on their own
        if (ctx.meta.webId === podOwner) {
          return next(ctx);
        }

        // If the webId is a registered application
        if (await ctx.call('app-registrations.isRegistered', { appUri: ctx.meta.webId, podOwner })) {
          const appUri = ctx.meta.webId;

          // If the app is trying to get the outbox or inbox, use webId system to improve performances
          if (collectionUri === urlJoin(podOwner, 'outbox')) {
            const specialRights = await ctx.call('access-authorizations.getSpecialRights', { appUri, podOwner });
            if (specialRights.includes('apods:ReadOutbox')) {
              ctx.params.webId = 'system';
            }
          } else if (collectionUri === urlJoin(podOwner, 'inbox')) {
            const specialRights = await ctx.call('access-authorizations.getSpecialRights', { appUri, podOwner });
            if (specialRights.includes('apods:ReadInbox')) {
              ctx.params.webId = 'system';
            }
          }
        }

        return await next(ctx);
      };
    }

    // Do not use the middleware for this action
    return next;
  }
});

export default AppControlMiddleware;
