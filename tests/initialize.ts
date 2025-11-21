import Redis from 'ioredis';
import fetch from 'node-fetch';
import { ServiceBroker, ActionParamSchema, CallingOptions } from 'moleculer';
import { Account, AuthAccountService } from '@semapps/auth';
import { CoreService as SemAppsCoreService } from '@semapps/core';
import { NodeinfoService } from '@semapps/nodeinfo';
import { ProxyService } from '@semapps/crypto';
import { TripleStoreAdapter } from '@semapps/triplestore';
import { WebAclMiddleware } from '@semapps/webacl';
import { interop, oidc, notify, apods, solid } from '@semapps/ontologies';
import { NotificationsListenerService } from '@semapps/solid';
import RdfJSONSerializer from '../pod-provider/backend/RdfJSONSerializer.ts';
import { fetchServer, clearMails } from './utils.ts';
import { FetchOptions } from './utilTypes.js';
import * as CONFIG from './config.ts';

Error.stackTraceLimit = Infinity;

const logger = {
  type: 'Console',
  options: {
    level: 'warn',
    // filename: 'moleculer-{date}-{nodeID}.txt',
    formatter: 'simple'
  }
};

export const listDatasets = async () => {
  const response = await fetch(`${CONFIG.SPARQL_ENDPOINT}$/datasets`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${CONFIG.JENA_USER}:${CONFIG.JENA_PASSWORD}`).toString('base64')}`
    }
  });

  if (response.ok) {
    const json = await response.json();
    return json.datasets.map((dataset: any) => dataset['ds.name'].substring(1));
  }
  return [];
};

export const dropDataset = (dataset: any) =>
  fetch(`${CONFIG.SPARQL_ENDPOINT + dataset}/update`, {
    method: 'POST',
    body: 'update=DROP+ALL',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CONFIG.JENA_USER}:${CONFIG.JENA_PASSWORD}`).toString('base64')}`
    }
  });

// Delete all data except special endpoints
export const clearSettingsDataset = () =>
  fetch(`${CONFIG.SPARQL_ENDPOINT}settings/update`, {
    method: 'POST',
    body: `
      DELETE {
        ?subject ?predicate ?object .
      } WHERE {
        ?subject ?predicate ?object .
        FILTER(STRSTARTS(STR(?subject), "urn:"))
      }
    `,
    headers: {
      'Content-Type': 'application/sparql-update',
      'X-SemappsUser': 'system',
      Authorization: `Basic ${Buffer.from(`${CONFIG.JENA_USER}:${CONFIG.JENA_PASSWORD}`).toString('base64')}`
    }
  });

export const clearRedisDb = async (redisUrl: string) => {
  const redisClient = new Redis(redisUrl);
  await redisClient.flushdb();
  redisClient.disconnect();
};

export const clearAllData = async () => {
  const datasets = await listDatasets();
  for (let dataset of datasets.filter((d: string) => d != 'settings')) {
    await dropDataset(dataset);
  }

  await clearSettingsDataset();

  await clearRedisDb(CONFIG.QUEUE_SERVICE_URL);
  await clearRedisDb(CONFIG.REDIS_OIDC_PROVIDER_URL);

  await clearMails();
};

export const connectPodProvider = async () => {
  // Connect to the Pod provider broker with a Redis transporter
  const broker = new ServiceBroker({
    nodeID: `test-node`,
    logger: false,
    transporter: CONFIG.REDIS_TRANSPORTER_URL,
    serializer: new RdfJSONSerializer()
  });

  await broker.start();

  // If the service is available, it means we are connected to the Pod provider broker
  await broker.waitForServices(['ldp']);

  // Reset internal cache (the channels have been deleted, but they are still in a this.channels array)
  await broker.waitForServices(['solid-notifications.provider.webhook']);
  await broker.call('solid-notifications.provider.webhook.resetCache');

  return broker;
};

export const initializeAppServer = async (
  port: number,
  appDataset: string,
  settingsDataset: string,
  queueServiceDb: number,
  appService: any
) => {
  const baseUrl = `http://localhost:${port}/`;
  const queueServiceUrl = `redis://localhost:6379/${queueServiceDb}`;

  await clearRedisDb(queueServiceUrl);

  const broker = new ServiceBroker({
    nodeID: `server${port}`,
    middlewares: [WebAclMiddleware({ baseUrl })],
    logger
  });

  broker.createService({
    mixins: [SemAppsCoreService],
    settings: {
      baseUrl,
      triplestore: {
        url: CONFIG.SPARQL_ENDPOINT,
        user: CONFIG.JENA_USER,
        password: CONFIG.JENA_PASSWORD,
        fusekiBase: CONFIG.FUSEKI_BASE,
        secure: false // TODO Remove when triplestore service is refactored
      },
      ontologies: [interop, oidc, apods, notify, solid],
      activitypub: {
        queueServiceUrl
      },
      api: {
        port
      },
      ldp: {
        resourcesWithContainerPath: false
      },
      void: false
    }
  });

  // @ts-expect-error Argument of type { 'mixin': {
  broker.createService({
    mixins: [AuthAccountService],
    adapter: new TripleStoreAdapter({ type: 'AuthAccount', dataset: settingsDataset })
  });

  // @ts-expect-error Argument of type { 'mixin': {
  broker.createService({
    mixins: [NodeinfoService],
    settings: {
      baseUrl
    }
  });

  // @ts-expect-error Argument of type { 'mixin': {
  broker.createService({
    mixins: [NotificationsListenerService],
    adapter: new TripleStoreAdapter({ type: 'WebhookChannelListener', dataset: settingsDataset }),
    settings: {
      baseUrl
    }
  });

  // @ts-expect-error Argument of type { 'mixin': {
  broker.createService({ mixins: [ProxyService] });

  // @ts-expect-error Argument of type { 'mixin': {
  broker.createService({ mixins: [appService], settings: { username: appDataset, queueServiceUrl } });

  await broker.start();

  const appUri = await broker.call('app.getUri');

  return {
    id: appUri,
    webId: appUri,
    username: appDataset,
    call: (actionName: string, params: ActionParamSchema = {}, options: CallingOptions = {}) =>
      broker.call(actionName, params, {
        ...options,
        meta: options.meta
          ? { ...options.meta, webId: appUri, dataset: appDataset }
          : { webId: appUri, dataset: appDataset }
      }),
    stop: () => broker.stop()
  };
};

export const createAccount = async (broker: ServiceBroker, username: string) => {
  const { webId }: Account = await broker.call('auth.account.create', { username });

  const callAsUser = (actionName: string, params: ActionParamSchema = {}, options: CallingOptions = {}) =>
    broker.call(actionName, params, { ...options, meta: { ...options.meta, webId, dataset: username } });

  const baseUrl = await broker.call('solid-storage.getBaseUrl', { username });

  const token = await broker.call('auth.jwt.generateServerSignedToken', { payload: { webId } });

  const fetchAsUser = async (url: string, options: FetchOptions = {}) => {
    let headers;
    if (options.headers) {
      headers = options.headers;
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      headers = new fetch.Headers({ Authorization: `Bearer ${token}` });
    }
    return fetchServer(url, { ...options, headers });
  };

  const actor: any = await callAsUser('activitypub.actor.awaitCreateComplete', {
    actorUri: webId,
    additionalKeys: [
      'pim:storage',
      'solid:oidcIssuer',
      'solid:publicTypeIndex',
      'interop:hasAuthorizationAgent',
      'interop:hasRegistrySet'
    ]
  });

  return {
    webId,
    token,
    baseUrl,
    username,
    call: callAsUser,
    fetch: fetchAsUser,
    ...actor
  };
};

export const installApp = async (actor: any, appUri: string) => {
  return await actor.call('registration-endpoint.register', { appUri, acceptAllRequirements: true });
};
