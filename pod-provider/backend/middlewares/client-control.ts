import urlJoin from 'url-join';
// @ts-expect-error TS(2614): Module '"moleculer-web"' has no exported member 'E... Remove this comment to see the full error message
import { Errors as E } from 'moleculer-web';
import { arrayOf, hasType, getWebIdFromUri, getDatasetFromUri } from '@semapps/ldp';
import { FULL_ACTIVITY_TYPES, FULL_ACTOR_TYPES } from '@semapps/activitypub';
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
  'notify:WebhookChannel2023',
  'interop:DataRegistration',
  'interop:AccessGrant',
  'interop:DelegatedAccessGrant'
];

// TODO use cache to improve performances
const getAllowedTypes = async (ctx: any, appUri: any, podOwner: any, accessMode: any) => {
  const authorizations = await ctx.call('access-authorizations.listByGrantee', { grantee: appUri, webId: podOwner });

  let types = [...DEFAULT_ALLOWED_TYPES];
  for (const authorization of authorizations) {
    if (arrayOf(authorization['interop:accessMode']).includes(accessMode)) {
      const shapeUri = await ctx.call('shape-trees.getShapeUri', {
        resourceUri: authorization['interop:registeredShapeTree']
      });
      // Binary resources don't have a shape
      if (shapeUri) {
        types.push(...(await ctx.call('shacl.getTypes', { resourceUri: shapeUri })));
      }
    }
  }

  return await ctx.call('jsonld.parser.expandTypes', { types });
};

// The registration may be on another Pod than the one of the request
// The meta is shared with the caller, so the dataset must be restored
const getRegistration = async (ctx: any, appUri: string, podOwner: string) => {
  const { dataset } = ctx.meta;
  try {
    return await ctx.call(
      'app-registrations.getForAgent',
      { agentUri: appUri, podOwner },
      { meta: { dataset: getDatasetFromUri(podOwner) } }
    );
  } finally {
    ctx.meta.dataset = dataset;
  }
};

const hasSpecialRight = (registration: any, right: string) =>
  arrayOf(registration?.['apods:hasSpecialRights']).includes(right);

// Actions called by the API gateway to authenticate the request
const isAuthAction = (actionName: string) =>
  /\.(authenticate|authorize)$/.test(actionName) ||
  ['auth.jwt.decodeToken', 'signature.verifyHttpSignature'].includes(actionName);

// API actions which applications with a clientId may call without being registered
// Either they are public, or they are about the calling application itself
const FREE_ACTIONS = [
  'api.favicon',
  'api.redirectToFront',
  'api.onWsConnection',
  'auth.redirectToForm',
  'frontend-config.get',
  'jsonld.api.getContext',
  'nodeinfo.getLinks',
  'nodeinfo.getSchema',
  'solid-endpoint.endpointGet',
  'solid-oidc.proxyConfig',
  'webfinger.get',
  'solid-notifications.provider.webhook.endpointGet',
  'solid-notifications.provider.websocket.endpointGet',
  'app-status.get',
  'registration-endpoint.getForAgent'
];

// API actions controlled by the wrappers below, which also handle applications acting in their own name
const WRAPPED_ACTIONS = [
  'signature.proxy.api_query',
  'activitypub.api.outbox',
  'webacl.group.api_create',
  'webacl.group.api_addMember',
  'sparqlEndpoint.query'
];

// Return the application acting on the Pod, if any
// Without clientId, the application is identified by its webId
const getAppUri = (ctx: any, podOwner: string) => {
  if (ctx.meta.clientId) return ctx.meta.webId === podOwner ? ctx.meta.clientId : undefined;
  return ctx.meta.webId === podOwner ? undefined : ctx.meta.webId;
};

const ClientControlMiddleware = ({ baseUrl }: any) => {
  // Same as getUriFromSlugParts of the LdpApiService (the pods route puts the username in the slugParts)
  const getLdpUri = ({ username, slugParts }: any) =>
    username ? urlJoin(baseUrl, username, ...(slugParts || [])) : urlJoin(baseUrl, ...(slugParts || []));
  const getAclUri = ({ slugParts }: any) => urlJoin(baseUrl, ...(slugParts?.length ? slugParts : ['/']));

  const checkRight = async (ctx: any, uri: string, mode: string) => {
    if (!(await ctx.call('permissions.has', { uri, mode, webId: ctx.meta.clientId }))) {
      throw new E.ForbiddenError('FORBIDDEN', `The application has no ${mode} right on ${uri}`);
    }
  };

  const checkSpecialRight = async (ctx: any, podOwner: string, right: string) => {
    if (!hasSpecialRight(await getRegistration(ctx, ctx.meta.clientId, podOwner), right)) {
      throw new E.ForbiddenError('FORBIDDEN', `The application has no permission ${right} on ${podOwner}`);
    }
  };

  const checkLdpRead = async (ctx: any) => {
    const uri = getLdpUri(ctx.params);
    const podOwner = getWebIdFromUri(uri);
    if (uri === urlJoin(podOwner, 'inbox')) return checkSpecialRight(ctx, podOwner, 'apods:ReadInbox');
    if (uri === urlJoin(podOwner, 'outbox')) return checkSpecialRight(ctx, podOwner, 'apods:ReadOutbox');
    return checkRight(ctx, uri, 'acl:Read');
  };

  const checkWacGroups = async (ctx: any) => {
    const podOwner = urlJoin(baseUrl, ctx.params.username);
    if (podOwner !== ctx.meta.webId)
      throw new E.ForbiddenError('FORBIDDEN', 'Only the Pod owner may handle ACL groups');
    return checkSpecialRight(ctx, podOwner, 'apods:CreateWacGroup');
  };

  const checkNotificationTopic = (ctx: any) =>
    checkRight(ctx, ctx.params.topic || ctx.params['notify:topic'], 'acl:Read');

  // Controls of the API actions called by applications with a clientId, once their registration is checked
  const CONTROLS: Record<string, (ctx: any) => Promise<any>> = {
    'ldp.api.get': checkLdpRead,
    'ldp.api.head': checkLdpRead,
    'ldp.api.post': ctx => checkRight(ctx, getLdpUri(ctx.params), 'acl:Append'),
    'ldp.api.put': ctx => checkRight(ctx, getLdpUri(ctx.params), 'acl:Write'),
    'ldp.api.patch': ctx => checkRight(ctx, getLdpUri(ctx.params), 'acl:Write'),
    'ldp.api.delete': ctx => checkRight(ctx, getLdpUri(ctx.params), 'acl:Write'),
    'webacl.resource.api_addRights': ctx => checkRight(ctx, getAclUri(ctx.params), 'acl:Control'),
    'webacl.resource.api_setRights': ctx => checkRight(ctx, getAclUri(ctx.params), 'acl:Control'),
    'webacl.resource.api_getRights': ctx => checkRight(ctx, getAclUri(ctx.params), 'acl:Read'),
    'webacl.resource.api_hasRights': ctx => checkRight(ctx, getAclUri(ctx.params), 'acl:Read'),
    'webacl.group.api_delete': checkWacGroups,
    'webacl.group.api_getGroups': checkWacGroups,
    'webacl.group.api_getMembers': checkWacGroups,
    'webacl.group.api_removeMember': checkWacGroups,
    'solid-notifications.provider.webhook.endpointPost': checkNotificationTopic,
    'solid-notifications.provider.websocket.endpointPost': checkNotificationTopic,
    // TODO Add a special right to sign and issue credentials in the name of the user
    'crypto.vc.data-integrity.signObject': async () => {},
    'crypto.vc.data-integrity.verifyObject': async () => {},
    'crypto.vc.holder.createPresentation': async () => {},
    'crypto.vc.issuer.createVC': async () => {},
    'crypto.vc.presentation.challenge.create': async () => {},
    'crypto.vc.verifier.verifyCapabilityPresentation': async () => {},
    'crypto.vc.verifier.verifyPresentation': async () => {},
    'crypto.vc.verifier.verifyVC': async () => {}
  };

  // Applications acting on behalf of a user are checked once, when the request enters the API
  // The clientId is kept in the meta, but it has no effect on the permissions of the following calls
  const controlClient = (next: any, action: any) => async (ctx: any) => {
    if (ctx.meta.clientId && ctx.caller === 'api' && !isAuthAction(action.name)) {
      if (FREE_ACTIONS.includes(action.name)) return next(ctx);

      const control = CONTROLS[action.name];
      if (!control && !WRAPPED_ACTIONS.includes(action.name)) {
        throw new E.ForbiddenError('FORBIDDEN', `Applications cannot call ${action.name}`);
      }

      // With On-Behalf-Of, the user may not exist on this server
      const account = await ctx.call('auth.account.findByWebId', { webId: ctx.meta.webId });
      if (!account || !(await getRegistration(ctx, ctx.meta.clientId, ctx.meta.webId))) {
        throw new E.ForbiddenError(
          'FORBIDDEN',
          `The application ${ctx.meta.clientId} is not registered by ${ctx.meta.webId}`
        );
      }

      if (control) await control(ctx);
    }
    return next(ctx);
  };

  return {
    name: 'ClientControlMiddleware',
    async started() {
      if (!baseUrl) throw new Error('The baseUrl config is missing for the ClientControlMiddleware');
    },
    localAction: (next: any, action: any) => controlClient(wrapAction(next, action), action)
  };

  function wrapAction(next: any, action: any) {
    if (action.name === 'signature.proxy.api_query') {
      return async (ctx: any) => {
        const podOwner = urlJoin(baseUrl, ctx.params.username);
        const url = ctx.params.id;

        // Bypass checks if user is querying his own pod
        const appUri = getAppUri(ctx, podOwner);
        if (!appUri) return next(ctx);

        const webId = ctx.meta.webId;
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
        if (!(await ctx.call('app-registrations.isRegistered', { agentUri: appUri, podOwner }))) {
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

        ctx.meta.webId = webId;

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
    } else if (action.name === 'activitypub.api.outbox') {
      return async (ctx: any) => {
        const { username, ...activity } = ctx.params;
        const podOwner = urlJoin(baseUrl, username);

        // Bypass checks if user is posting to their outbox
        const appUri = getAppUri(ctx, podOwner);
        if (!appUri) return next(ctx);

        const appRegistration = await getRegistration(ctx, appUri, podOwner);

        // Ensure the webId is a registered application
        if (!appRegistration)
          throw new E.ForbiddenError(`Only registered applications may post to the user outbox. WebID: ${appUri}`);

        if (!arrayOf(appRegistration['apods:hasSpecialRights']).includes('apods:PostOutbox')) {
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

        // Impersonate the user so that the activity can be posted to their outbox
        ctx.meta.webId = podOwner;

        ctx.params.generator = appUri;

        return await next(ctx);
      };
    } else if (action.name === 'webacl.group.api_create') {
      return async (ctx: any) => {
        const { username } = ctx.params;
        const podOwner = urlJoin(baseUrl, username);

        // Bypass checks if user is acting on their own pod
        const appUri = getAppUri(ctx, podOwner);
        if (!appUri) {
          if (ctx.meta.webId !== podOwner) throw new E.ForbiddenError(`Only the Pod owner may handle ACL groups`);
          return next(ctx);
        }

        const appRegistration = await getRegistration(ctx, appUri, podOwner);

        // Ensure the webId is a registered application
        if (!appRegistration) {
          throw new E.ForbiddenError(`Only registered applications may handle ACL groups`);
        }

        if (!arrayOf(appRegistration['apods:hasSpecialRights']).includes('apods:CreateWacGroup')) {
          throw new E.ForbiddenError(`The application has no permission to handle ACL groups (apods:CreateWacGroup)`);
        }

        return await next(ctx);
      };
    } else if (action.name === 'webacl.group.api_addMember') {
      return async (ctx: any) => {
        const { username } = ctx.params;
        const podOwner = urlJoin(baseUrl, username);

        // Bypass checks if user is acting on their own Pod
        const appUri = getAppUri(ctx, podOwner);
        if (!appUri) return next(ctx);

        const appRegistration = await getRegistration(ctx, appUri, podOwner);

        // If the webId is a registered application, use the system webId to bypass WAC checks
        if (appRegistration) {
          if (!arrayOf(appRegistration['apods:hasSpecialRights']).includes('apods:CreateWacGroup')) {
            throw new E.ForbiddenError(`The application has no permission to handle ACL groups (apods:CreateWacGroup)`);
          }

          const webId = ctx.meta.webId;
          ctx.meta.webId = 'system';

          const result = await next(ctx);

          ctx.meta.webId = webId;

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
        const appUri = getAppUri(ctx, podOwner);
        if (!appUri) return next(ctx);

        const appRegistration = await getRegistration(ctx, appUri, podOwner);

        // If the webId is a registered application, check it has the special right
        if (appUri !== 'anon' && appUri !== 'system' && appRegistration) {
          if (!arrayOf(appRegistration['apods:hasSpecialRights']).includes('apods:QuerySparqlEndpoint')) {
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
        const appUri = getAppUri(ctx, podOwner);
        if (!appUri) return next(ctx);

        const appRegistration = await getRegistration(ctx, appUri, podOwner);

        // If the webId is a registered application
        if (appRegistration) {
          // If the app is trying to get the outbox or inbox, use webId system to improve performances
          if (collectionUri === urlJoin(podOwner, 'outbox')) {
            if (arrayOf(appRegistration['apods:hasSpecialRights']).includes('apods:ReadOutbox')) {
              ctx.params.webId = 'system';
            }
          } else if (collectionUri === urlJoin(podOwner, 'inbox')) {
            if (arrayOf(appRegistration['apods:hasSpecialRights']).includes('apods:ReadInbox')) {
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
};

export default ClientControlMiddleware;
