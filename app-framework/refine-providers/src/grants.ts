import LinkHeader from 'http-link-header';
import {
  arrayOf,
  fetchGrant,
  fetchJson,
  fetchStorage,
  fetchWithSession,
  getPublicGrants,
  getTypesFromShapeTree,
  isScope,
  resolveAuthAgent
} from './utils';
import { subscribeToTopic } from './notifications';
import { AuthSession, ResourceConfig, UnwatchFn } from './types';

export type SharedSource = { dataOwner: string } & ({ containerUri: string } | { resourceUris: string[] });

// In case the notifications of the AppRegistration are not received
const APP_GRANTS_TTL = 5 * 60_000;

const appRegistrationUris = new Map<string, Promise<string | undefined>>();
const appGrantsCache = new Map<string, { grants: Promise<Record<string, any>[]>; loadedAt: number }>();
const appRegistrationWatchers = new Map<string, Promise<UnwatchFn | undefined>>();
const listeners = new Set<(webId: string) => void>();

const getAppRegistrationUri = (session: AuthSession) => {
  if (!appRegistrationUris.has(session.webId)) {
    appRegistrationUris.set(
      session.webId,
      resolveAuthAgent(session.webId, session.token).then(
        ({ appRegistrationUri }) => appRegistrationUri,
        () => undefined
      )
    );
  }
  return appRegistrationUris.get(session.webId)!;
};

// A single subscription per user: the AppRegistration is updated whenever its grants change
const watchAppRegistration = (session: AuthSession, appRegistrationUri: string) => {
  if (appRegistrationWatchers.has(session.webId) || typeof WebSocket === 'undefined') return;
  appRegistrationWatchers.set(
    session.webId,
    subscribeToTopic(appRegistrationUri, session, () => invalidateAppGrants(session.webId)).catch(e => {
      console.warn(`Could not watch ${appRegistrationUri}`, e);
      appRegistrationWatchers.delete(session.webId);
      return undefined;
    })
  );
};

const loadAppGrants = async (session: AuthSession) => {
  const appRegistrationUri = await getAppRegistrationUri(session);
  if (!appRegistrationUri) return [];
  watchAppRegistration(session, appRegistrationUri);

  const { json: appRegistration } = await fetchJson(appRegistrationUri, {}, session.token);
  const grants = await Promise.all(
    arrayOf<string>(appRegistration['interop:hasAccessGrant']).map(uri => fetchGrant(uri, session))
  );
  return grants.filter(grant => !!grant) as Record<string, any>[];
};

/**
 * The access grants of the app, given by the logged-in user, including the data shared with them.
 * Kept in memory, and reloaded when the AppRegistration changes.
 */
export const getAppGrants = (session: AuthSession): Promise<Record<string, any>[]> => {
  const cached = appGrantsCache.get(session.webId);
  if (cached && Date.now() - cached.loadedAt < APP_GRANTS_TTL) return cached.grants;

  const grants = loadAppGrants(session);
  appGrantsCache.set(session.webId, { grants, loadedAt: Date.now() });
  grants.catch(() => appGrantsCache.delete(session.webId));
  return grants;
};

/** Reload the grants on next use, for the given user or for everyone */
export const invalidateAppGrants = (webId?: string) => {
  const webIds = webId ? [webId] : [...appGrantsCache.keys()];
  webIds.forEach(id => appGrantsCache.delete(id));
  webIds.forEach(notifyAccessChange);
};

/** Tell the listeners that the rights of a user may have changed (e.g. public grants) */
export const notifyAccessChange = (webId: string) => listeners.forEach(listener => listener(webId));

/** Called when the grants of a user may have changed. Returns a function to stop listening */
export const onAppGrantsChange = (listener: (webId: string) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Forget everything about the user (on logout) */
export const clearAppGrants = async (webId: string) => {
  appGrantsCache.delete(webId);
  appRegistrationUris.delete(webId);
  const unwatch = await appRegistrationWatchers.get(webId);
  appRegistrationWatchers.delete(webId);
  unwatch?.();
};

/** Find the data of other users shared with the app through its access grants, matching the given resource */
export const discoverSharedSources = async (
  resourceConfig: ResourceConfig,
  wantedTypes: string[],
  session: AuthSession
): Promise<SharedSource[]> => {
  const sources: SharedSource[] = [];
  for (const grant of await getAppGrants(session)) {
    if (grant['interop:dataOwner'] === session.webId) continue;

    const shapeTreeUri = grant['interop:registeredShapeTree'];
    const matches = resourceConfig.shapeTreeUri
      ? shapeTreeUri === resourceConfig.shapeTreeUri
      : !!shapeTreeUri && (await getTypesFromShapeTree(shapeTreeUri)).some(type => wantedTypes.includes(type));
    if (!matches) continue;

    if (isScope(grant, 'AllFromRegistry')) {
      sources.push({ dataOwner: grant['interop:dataOwner'], containerUri: grant['interop:hasDataRegistration'] });
    } else {
      sources.push({
        dataOwner: grant['interop:dataOwner'],
        resourceUris: arrayOf<string>(grant['interop:hasDataInstance'])
      });
    }
  }
  return sources;
};

// Filled by the data provider, to avoid fetching a resource to know its data registration
const dataRegistrations = new Map<string, string>();

export const rememberDataRegistration = (resourceUri: string, dataRegistrationUri?: string) => {
  if (dataRegistrationUri) dataRegistrations.set(resourceUri, dataRegistrationUri);
};

export const getDataRegistrationFromHeaders = (headers: Headers) =>
  LinkHeader.parse(headers.get('Link') || '').rel('http://www.w3.org/ns/solid/interop#hasDataRegistration')[0]?.uri;

const hasAccessMode = (grant: Record<string, any>, mode: string) =>
  arrayOf<string>(grant['interop:accessMode']).some(
    m => m === `acl:${mode}` || m === `http://www.w3.org/ns/auth/acl#${mode}`
  );

// The grants of the app, and those given to everyone or to all connected users on the storages
const getGrants = async (session: AuthSession, storageUris: string[]) => {
  const publicGrants = await Promise.all(
    storageUris.map(async storageUri =>
      getPublicGrants(storageUri, await fetchStorage(storageUri, session), session).catch(() => [])
    )
  );
  return [...(await getAppGrants(session)), ...publicGrants.flat()];
};

/**
 * Whether the app may modify a resource on behalf of the logged-in user. The Pod only allows the app what
 * both the user and the app's access grants allow, and the grants are derived from the user's own rights.
 * Pass the storages which may have public grants on the resource.
 */
export const canWriteResource = async (
  resourceUri: string,
  session?: AuthSession,
  storageUris: string[] = []
): Promise<boolean> => {
  if (!session) return false;
  if (!dataRegistrations.has(resourceUri)) {
    const { headers } = await fetchWithSession(resourceUri, {}, session);
    rememberDataRegistration(resourceUri, getDataRegistrationFromHeaders(headers));
  }
  const dataRegistrationUri = dataRegistrations.get(resourceUri);

  return (await getGrants(session, storageUris)).some(
    grant =>
      hasAccessMode(grant, 'Write') &&
      (isScope(grant, 'AllFromRegistry')
        ? !!dataRegistrationUri && grant['interop:hasDataRegistration'] === dataRegistrationUri
        : arrayOf<string>(grant['interop:hasDataInstance']).includes(resourceUri))
  );
};

/** Whether the app may create resources in a container on behalf of the logged-in user (see `canWriteResource`) */
export const canWriteContainer = async (
  containerUri: string,
  session?: AuthSession,
  storageUris: string[] = []
): Promise<boolean> => {
  if (!session) return false;
  return (await getGrants(session, storageUris)).some(
    grant =>
      (hasAccessMode(grant, 'Write') || hasAccessMode(grant, 'Append')) &&
      isScope(grant, 'AllFromRegistry') &&
      grant['interop:hasDataRegistration'] === containerUri
  );
};
