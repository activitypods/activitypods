import jsonld from 'jsonld';
import LinkHeader from 'http-link-header';
import type { ConditionalFilter, CrudFilter, CrudFilters, CrudSort, CrudSorting, LogicalFilter } from '@refinedev/core';
import type { AppStatus, AuthSession, JsonContext, ResourceConfig } from './types';

/** Default JSON-LD context used when none is configured: the ActivityStreams 2 vocabulary. */
export const DEFAULT_CONTEXT: JsonContext = ['https://www.w3.org/ns/activitystreams'];

/** Turn a value that may be a single item, an array, or nullish into an array. */
export const arrayOf = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const isURI = (value: string): boolean =>
  value.startsWith('http://') || value.startsWith('https://') || value.startsWith('urn:');

export type FetchJsonResult = { status: number; headers: Headers; json: any };

/**
 * A small `fetch` wrapper used for every call made to a Pod: sets the `Accept`/`Content-Type`
 * headers expected by ActivityPods servers, attaches the bearer token (if any), and parses
 * the JSON-LD body.
 */
export const fetchJson = async (url: string, options: RequestInit = {}, token?: string): Promise<FetchJsonResult> => {
  if (!url) throw new Error('No URL provided to fetchJson');

  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/ld+json');
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/ld+json');
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });

  let json: any;
  if (response.status !== 204 && response.status !== 205) {
    const text = await response.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        // Not a JSON body (e.g. an empty or plain-text error page): ignore
      }
    }
  }

  if (!response.ok) {
    const error: Error & { status?: number; body?: any } = new Error(
      json?.error?.message || json?.message || response.statusText || `Request to ${url} failed`
    );
    error.status = response.status;
    error.body = json;
    throw error;
  }

  return { status: response.status, headers: response.headers, json };
};

const proxyUrls = new Map<string, Promise<string | undefined>>();

const getProxyUrl = (session: AuthSession) => {
  if (!proxyUrls.has(session.webId)) {
    proxyUrls.set(
      session.webId,
      fetchJson(session.webId, {}, session.token).then(
        ({ json }) => json?.endpoints?.proxyUrl,
        () => undefined
      )
    );
  }
  return proxyUrls.get(session.webId)!;
};

/**
 * Like `fetchJson`, as the logged-in user. A Pod only accepts the tokens it issued itself, so
 * resources on other servers are fetched through the proxy endpoint of the user's Pod, which
 * signs the request on their behalf.
 */
export const fetchWithSession = async (
  url: string,
  options: RequestInit = {},
  session?: AuthSession
): Promise<FetchJsonResult> => {
  if (!session?.webId || new URL(url).origin === new URL(session.webId).origin) {
    return fetchJson(url, options, session?.token);
  }

  const proxyUrl = await getProxyUrl(session);
  if (!proxyUrl) return fetchJson(url, options);

  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/ld+json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/ld+json');

  const formData = new FormData();
  formData.append('id', url);
  formData.append('method', options.method || 'GET');
  const headersObject: Record<string, string> = {};
  headers.forEach((value, key) => (headersObject[key] = value));
  formData.append('headers', JSON.stringify(headersObject));
  if (options.body) formData.append('body', options.body as string | Blob);

  return fetchJson(proxyUrl, { method: 'POST', body: formData }, session.token);
};

/** Expand CURIEs (e.g. `as:Event`) into full URIs, using a JSON-LD context. Full URIs are returned as-is. */
export const expandTypes = async (types: string[], context: JsonContext): Promise<string[]> => {
  if (types.every(isURI)) return types;

  const result = await jsonld.expand({ '@context': context, '@type': types } as any);
  const expanded = arrayOf<string>(result[0]?.['@type'] as any);

  if (expanded.length === 0 || !expanded.every(isURI)) {
    throw new Error(
      `Could not expand type(s) "${types.join(', ')}" into full URIs using the configured JSON-LD context.`
    );
  }

  return expanded;
};

const shapeTreeCache = new Map<string, Promise<string[]>>();

/** Resolve the `sh:targetClass` type(s) targeted by a shape tree's shape. Results are cached (shape trees are static). */
export const getTypesFromShapeTree = (shapeTreeUri: string): Promise<string[]> => {
  if (!shapeTreeCache.has(shapeTreeUri)) {
    shapeTreeCache.set(
      shapeTreeUri,
      (async () => {
        const { json: rawShapeTree } = await fetchJson(shapeTreeUri);

        const shapeTree = await jsonld.compact(rawShapeTree, {
          st: 'http://www.w3.org/ns/shapetrees#',
          shape: { '@id': 'st:shape', '@type': '@id' }
        } as any);

        if (!(shapeTree as any).shape) return [];

        const { json: shape } = await fetchJson((shapeTree as any).shape);
        return arrayOf(shape?.[0]?.['http://www.w3.org/ns/shacl#targetClass']).map((node: any) => node?.['@id']);
      })()
    );
  }
  return shapeTreeCache.get(shapeTreeUri)!;
};

export type ContainerRegistration = {
  containerUri: string;
  /** Classes of the type registration. Not set for data registrations, whose types come from the shape tree */
  types?: string[];
  shapeTreeUri?: string;
};

const fetchAsSession = async (url: string, session?: AuthSession, headers?: HeadersInit) =>
  (await fetchWithSession(url, { headers }, session)).json;

/**
 * A `solid:hasTypeRegistration` entry is usually dereferenced by the Pod, but may be left as a
 * plain URI. `solid:forClass` comes back compacted and dereferenced entries don't carry their
 * own `@context`, so the type index's context is used to expand it.
 */
const resolveTypeRegistration = async (
  entry: any,
  fallbackContext: JsonContext,
  session?: AuthSession
): Promise<ContainerRegistration | undefined> => {
  const registration = typeof entry === 'string' ? await fetchAsSession(entry, session) : entry;
  const forClass = arrayOf<string>(registration?.['solid:forClass']);
  if (!registration?.['solid:instanceContainer']) return undefined;
  return {
    containerUri: registration['solid:instanceContainer'],
    types: forClass.length > 0 ? await expandTypes(forClass, registration['@context'] ?? fallbackContext) : []
  };
};

const fetchTypeIndex = async (typeIndexUri: string, session?: AuthSession): Promise<ContainerRegistration[]> => {
  const typeIndex = await fetchAsSession(typeIndexUri, session);
  const context: JsonContext = typeIndex['@context'] ?? DEFAULT_CONTEXT;
  const registrations = await Promise.all(
    arrayOf<any>(typeIndex['solid:hasTypeRegistration']).map(entry => resolveTypeRegistration(entry, context, session))
  );
  return registrations.filter((r): r is ContainerRegistration => !!r);
};

type DiscoveryStrategy = (
  storageUri: string,
  storage: Record<string, any>,
  session?: AuthSession
) => Promise<ContainerRegistration[]>;

const publicTypeIndex: DiscoveryStrategy = async (storageUri, storage, session) =>
  storage['solid:publicTypeIndex'] ? fetchTypeIndex(storage['solid:publicTypeIndex'], session) : [];

// Only the owner of the storage can read its private type index
const privateTypeIndex: DiscoveryStrategy = async (storageUri, storage, session) => {
  if (storageUri !== session?.webId || !storage['pim:preferencesFile']) return [];
  const preferencesFile = await fetchAsSession(storage['pim:preferencesFile'], session);
  return preferencesFile['solid:privateTypeIndex']
    ? fetchTypeIndex(preferencesFile['solid:privateTypeIndex'], session)
    : [];
};

const dataRegistry: DiscoveryStrategy = async (storageUri, storage, session) => {
  if (!storage['interop:hasRegistrySet']) return [];
  const registrySet = await fetchAsSession(storage['interop:hasRegistrySet'], session);
  const registrations: ContainerRegistration[] = [];
  for (const dataRegistryUri of arrayOf<string>(registrySet['interop:hasDataRegistry'])) {
    const dataRegistry = await fetchAsSession(dataRegistryUri, session);
    const dataRegistrations = await Promise.all(
      arrayOf<any>(dataRegistry['interop:hasDataRegistration']).map(entry =>
        typeof entry === 'string'
          ? fetchAsSession(entry, session, {
              Accept: 'application/ld+json',
              Prefer: 'return=representation; include="http://www.w3.org/ns/ldp#PreferMinimalContainer"'
            })
          : entry
      )
    );
    for (const dataRegistration of dataRegistrations) {
      registrations.push({
        containerUri: dataRegistration.id ?? dataRegistration['@id'],
        shapeTreeUri: dataRegistration['interop:registeredShapeTree']
      });
    }
  }
  return registrations;
};

// Registrations rarely change while an app is open. Failures are not cached, so they can be retried.
const discoveryCache = new Map<string, Promise<any>>();

const cached = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  if (!discoveryCache.has(key)) {
    discoveryCache.set(
      key,
      fn().catch(e => {
        discoveryCache.delete(key);
        throw e;
      })
    );
  }
  return discoveryCache.get(key)!;
};

/**
 * The grants given to everyone (`interop:hasPublicAgentRegistration`) and, for logged-in users, to all
 * authenticated agents (`interop:hasConnectedAgentRegistration`). Proposed extension of SAI.
 */
export const getPublicGrants = (storageUri: string, storage: Record<string, any>, session?: AuthSession) =>
  cached(`${session?.webId ?? ''}|${storageUri}|public`, async () => {
    const registrations = [
      { uri: storage['interop:hasPublicAgentRegistration'], session: undefined },
      { uri: session && storage['interop:hasConnectedAgentRegistration'], session }
    ].filter(({ uri }) => uri);
    const grants: Record<string, any>[] = [];
    for (const { uri, session: registrationSession } of registrations) {
      try {
        const registration = await fetchAsSession(uri, registrationSession);
        for (const grantUri of arrayOf<string>(registration['interop:hasAccessGrant'])) {
          const grant = await fetchGrant(grantUri, registrationSession);
          if (grant) grants.push(grant);
        }
      } catch {
        // Not readable (e.g. an application not registered by the user)
      }
    }
    return grants;
  });

export const isScope = (grant: Record<string, any>, scope: string) =>
  `${grant['interop:scopeOfGrant']}`.endsWith(scope);

const publicGrants: DiscoveryStrategy = async (storageUri, storage, session) =>
  (await getPublicGrants(storageUri, storage, session))
    .filter(grant => isScope(grant, 'AllFromRegistry'))
    .map(grant => ({
      containerUri: grant['interop:hasDataRegistration'],
      shapeTreeUri: grant['interop:registeredShapeTree']
    }));

// Public grants first: they only point to what can really be read
const DISCOVERY_STRATEGIES = [publicGrants, publicTypeIndex, privateTypeIndex, dataRegistry];

const registrationMatches = async (
  registration: ContainerRegistration,
  resourceConfig: ResourceConfig,
  wantedTypes: string[]
) => {
  if (resourceConfig.shapeTreeUri && registration.shapeTreeUri) {
    return registration.shapeTreeUri === resourceConfig.shapeTreeUri;
  }
  const types =
    registration.types ?? (registration.shapeTreeUri ? await getTypesFromShapeTree(registration.shapeTreeUri) : []);
  return types.some(type => wantedTypes.includes(type));
};

/** Discover the containers and public grants of a storage again on next use */
export const invalidateStorage = (storageUri: string) => {
  for (const key of discoveryCache.keys()) {
    if (key.split('|')[1] === storageUri) discoveryCache.delete(key);
  }
};

export const fetchStorage = (storageUri: string, session?: AuthSession): Promise<Record<string, any>> =>
  cached(`${session?.webId ?? ''}|${storageUri}`, () => fetchAsSession(storageUri, session));

/** Find the resources of a storage which are public one by one (not their whole container) */
export const findPublicResources = async (
  storageUri: string,
  resourceConfig: ResourceConfig,
  wantedTypes: string[],
  session?: AuthSession
): Promise<string[]> => {
  const storage = await fetchStorage(storageUri, session);
  const resourceUris: string[] = [];
  for (const grant of await getPublicGrants(storageUri, storage, session)) {
    const matches = await registrationMatches(
      { containerUri: grant['interop:hasDataRegistration'], shapeTreeUri: grant['interop:registeredShapeTree'] },
      resourceConfig,
      wantedTypes
    );
    if (matches && isScope(grant, 'SelectedFromRegistry')) {
      resourceUris.push(...arrayOf<string>(grant['interop:hasDataInstance']));
    }
  }
  return resourceUris;
};

/**
 * Find the container of a resource in a storage (in ActivityPods, the WebID of a user, a group or an app).
 * Its public type index is tried first, then its private type index (for the logged-in user only),
 * then its SAI data registry (usually only readable by its owner). Works without session for public data.
 */
export const findContainerUri = async (
  storageUri: string,
  resourceConfig: ResourceConfig,
  wantedTypes: string[],
  session?: AuthSession
): Promise<string | undefined> => {
  const sessionKey = session?.webId ?? '';
  const storage = await fetchStorage(storageUri, session);

  for (const [i, strategy] of DISCOVERY_STRATEGIES.entries()) {
    let registrations: ContainerRegistration[];
    try {
      registrations = await cached(`${sessionKey}|${storageUri}|${i}`, () => strategy(storageUri, storage, session));
    } catch {
      continue;
    }
    for (const registration of registrations) {
      if (await registrationMatches(registration, resourceConfig, wantedTypes)) return registration.containerUri;
    }
  }
  return undefined;
};

/** Resolve the type URI(s) a resource should be created/matched with, from its config. */
export const resolveResourceTypes = async (
  resourceConfig: ResourceConfig,
  jsonContext: JsonContext
): Promise<string[]> => {
  if (resourceConfig.types) return expandTypes(arrayOf(resourceConfig.types), jsonContext);
  if (resourceConfig.shapeTreeUri) return getTypesFromShapeTree(resourceConfig.shapeTreeUri);
  return [];
};

/** Find the container of a resource in the Pod of the logged-in user. */
export const resolveContainerUri = async (
  resourceId: string,
  resourceConfig: ResourceConfig,
  webId: string,
  token: string,
  jsonContext: JsonContext
): Promise<string> => {
  const wantedTypes = await resolveResourceTypes(resourceConfig, jsonContext);
  if (wantedTypes.length === 0) {
    throw new Error(`Resource "${resourceId}" must define either \`shapeTreeUri\` or \`types\``);
  }

  const containerUri = await findContainerUri(webId, resourceConfig, wantedTypes, { webId, token });
  if (containerUri) return containerUri;

  throw new Error(
    `No container found in ${webId}'s type index for resource "${resourceId}" (type(s): ${wantedTypes.join(', ')}). ` +
      `Has the app declared this access need, and has the user granted access to it?`
  );
};

export type AuthAgentResolution = {
  /** The fetched Authorization Agent resource (e.g. for `interop:hasAuthorizationRedirectEndpoint`) */
  authAgent: Record<string, any>;
  /** The AppRegistration URI, if this app is already registered with the WebID's authorization agent */
  appRegistrationUri: string | undefined;
};

/**
 * Look up a WebID's Authorization Agent, and check (via the `registeredAgent` Link header, per
 * https://solid.github.io/data-interoperability-panel/specification/#agent-registration-discovery)
 * whether this app already has an AppRegistration there.
 */
export const resolveAuthAgent = async (webId: string, token?: string): Promise<AuthAgentResolution> => {
  const { json: actor } = await fetchJson(webId, {}, token);
  const authAgentUri = actor['interop:hasAuthorizationAgent'];
  if (!authAgentUri) throw new Error(`WebID ${webId} has no registered authorization agent`);

  const { headers, json: authAgent } = await fetchJson(authAgentUri, {}, token);
  const linkHeaderValue = headers.get('Link');
  const registeredAgentLinks = linkHeaderValue
    ? LinkHeader.parse(linkHeaderValue).rel('http://www.w3.org/ns/solid/interop#registeredAgent')
    : [];

  return { authAgent, appRegistrationUri: registeredAgentLinks[0]?.anchor };
};

// Grants are replaced (new URI) rather than modified
const grantsCache = new Map<string, Promise<Record<string, any> | undefined>>();

export const fetchGrant = (uri: string, session?: AuthSession) => {
  if (!grantsCache.has(uri)) {
    grantsCache.set(
      uri,
      fetchWithSession(uri, {}, session).then(
        ({ json }) => json,
        () => undefined
      )
    );
  }
  return grantsCache.get(uri)!;
};

/**
 * Fetch this app's status from the Pod provider hosting `webId`: whether it's registered, and
 * whether the access needs it was granted are stale (`upgradeNeeded`). The Pod identifies the
 * calling app from the access token itself (Solid-OIDC's `azp` claim), so no app URI is needed.
 */
export const fetchAppStatus = async (webId: string, token: string): Promise<AppStatus> => {
  const endpoint = new URL('/.well-known/app-status', new URL(webId).origin).toString();
  const { json } = await fetchJson(endpoint, {}, token);
  return json as AppStatus;
};

/** Normalize a JSON-LD resource (from a container's `ldp:contains`, or fetched directly) into a Refine record with an `id`. */
export const normalizeRecord = (resource: Record<string, any>, containerContext?: JsonContext) => {
  const id = resource.id || resource['@id'];
  if (!id) throw new Error('Resource is missing an @id / id property');
  return {
    '@context': containerContext,
    ...resource,
    id
  };
};

const getFieldValue = (record: any, field: string) =>
  field
    .split('.')
    .reduce<any>((value, key) => (value === undefined || value === null ? undefined : value[key]), record);

const compareStrings = (a: string, b: string, caseSensitive: boolean) =>
  caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase();

/** Lowercase a string and remove its diacritics, like the Pod does when searching (`?q=`). */
const simplifyString = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const includesString = (haystack: string, needle: string, caseSensitive: boolean) =>
  caseSensitive ? haystack.includes(needle) : simplifyString(haystack).includes(simplifyString(needle));

/** Field of the special filter searching keywords in all the literals of a resource: `{ field: "q", operator: "contains", value }`. */
export const SEARCH_FIELD = 'q';

/**
 * Field of the special filter keeping resources near a point (or without location):
 * `{ field: "near", operator: "eq", value: { latitude, longitude, radius } }`, with the radius in km.
 * The location is read from `vcard:hasGeo` (`vcard:latitude` / `vcard:longitude`).
 */
export const NEAR_FIELD = 'near';

export type NearFilterValue = { latitude: number; longitude: number; radius: number };

const distanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const rad = Math.PI / 180;
  const sinLat = Math.sin(((b.latitude - a.latitude) * rad) / 2);
  const sinLon = Math.sin(((b.longitude - a.longitude) * rad) / 2);
  return (
    12742 *
    Math.asin(Math.sqrt(sinLat * sinLat + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * sinLon * sinLon))
  );
};

const isNear = (record: any, near: NearFilterValue) => {
  const positions = arrayOf<any>(record['vcard:hasGeo'])
    .map(geo => ({ latitude: Number(geo?.['vcard:latitude']), longitude: Number(geo?.['vcard:longitude']) }))
    .filter(position => Number.isFinite(position.latitude) && Number.isFinite(position.longitude));
  return positions.length === 0 || positions.some(position => distanceKm(near, position) <= near.radius);
};

const matchesSearch = (record: any, keywords: string) =>
  Object.entries(record).some(
    ([key, value]) =>
      key !== '@context' && arrayOf<any>(value).some(v => typeof v === 'string' && includesString(v, keywords, false))
  );

const matchesLogicalFilter = (record: any, filter: LogicalFilter): boolean => {
  if (filter.field === SEARCH_FIELD && filter.operator === 'contains') {
    return !filter.value || matchesSearch(record, String(filter.value));
  }
  if (filter.field === NEAR_FIELD && filter.operator === 'eq') {
    return !filter.value || isNear(record, filter.value);
  }

  const fieldValue = getFieldValue(record, filter.field);
  const values = arrayOf(fieldValue);
  const { operator, value } = filter;

  switch (operator) {
    case 'eq':
      return values.some(v =>
        typeof v === 'string' && typeof value === 'string' ? compareStrings(v, value, false) : v === value
      );
    case 'eqs':
      return values.some(v => v === value);
    case 'ne':
      return values.every(
        v => !(typeof v === 'string' && typeof value === 'string' ? compareStrings(v, value, false) : v === value)
      );
    case 'nes':
      return values.every(v => v !== value);
    case 'in':
    case 'ina':
      return values.some(v => arrayOf(value).some(v2 => compareStrings(String(v), String(v2), false)));
    case 'nin':
    case 'nina':
      return !values.some(v => arrayOf(value).some(v2 => compareStrings(String(v), String(v2), false)));
    case 'contains':
      return values.some(v => typeof v === 'string' && includesString(v, String(value), false));
    case 'containss':
      return values.some(v => typeof v === 'string' && includesString(v, String(value), true));
    case 'ncontains':
      return !values.some(v => typeof v === 'string' && includesString(v, String(value), false));
    case 'ncontainss':
      return !values.some(v => typeof v === 'string' && includesString(v, String(value), true));
    case 'startswith':
      return values.some(v => typeof v === 'string' && v.toLowerCase().startsWith(String(value).toLowerCase()));
    case 'startswiths':
      return values.some(v => typeof v === 'string' && v.startsWith(String(value)));
    case 'nstartswith':
      return !values.some(v => typeof v === 'string' && v.toLowerCase().startsWith(String(value).toLowerCase()));
    case 'nstartswiths':
      return !values.some(v => typeof v === 'string' && v.startsWith(String(value)));
    case 'endswith':
      return values.some(v => typeof v === 'string' && v.toLowerCase().endsWith(String(value).toLowerCase()));
    case 'endswiths':
      return values.some(v => typeof v === 'string' && v.endsWith(String(value)));
    case 'nendswith':
      return !values.some(v => typeof v === 'string' && v.toLowerCase().endsWith(String(value).toLowerCase()));
    case 'nendswiths':
      return !values.some(v => typeof v === 'string' && v.endsWith(String(value)));
    case 'lt':
      return values.some(v => v < value);
    case 'lte':
      return values.some(v => v <= value);
    case 'gt':
      return values.some(v => v > value);
    case 'gte':
      return values.some(v => v >= value);
    case 'between':
      return values.some(v => v >= value[0] && v <= value[1]);
    case 'nbetween':
      return !values.some(v => v >= value[0] && v <= value[1]);
    case 'null':
      return fieldValue === undefined || fieldValue === null;
    case 'nnull':
      return fieldValue !== undefined && fieldValue !== null;
    default:
      return true;
  }
};

const isConditionalFilter = (filter: CrudFilter): filter is ConditionalFilter =>
  filter.operator === 'and' || filter.operator === 'or';

const matchesFilter = (record: any, filter: CrudFilter): boolean => {
  if (isConditionalFilter(filter)) {
    return filter.operator === 'and'
      ? filter.value.every(child => matchesFilter(record, child))
      : filter.value.some(child => matchesFilter(record, child));
  }
  return matchesLogicalFilter(record, filter);
};

/** Apply Refine's `CrudFilters` (logical + and/or conditional filters) to an in-memory list of records. */
export const applyFilters = <T>(records: T[], filters?: CrudFilters): T[] => {
  if (!filters || filters.length === 0) return records;
  return records.filter(record => filters.every(filter => matchesFilter(record, filter)));
};

const compareValues = (a: any, b: any): number => {
  if (a === undefined || a === null) return b === undefined || b === null ? 0 : -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

/** Apply Refine's `CrudSorting` (multi-field sort) to an in-memory list of records. */
export const applySorters = <T>(records: T[], sorters?: CrudSorting): T[] => {
  if (!sorters || sorters.length === 0) return records;
  return [...records].sort((a, b) => {
    for (const sorter of sorters as CrudSort[]) {
      const cmp = compareValues(getFieldValue(a, sorter.field), getFieldValue(b, sorter.field));
      if (cmp !== 0) return sorter.order === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
};

/** Expand a field (e.g. `vcard:given-name`) into a full predicate URI, using a JSON-LD context. */
const expandPredicate = async (field: string, context: JsonContext): Promise<string | undefined> => {
  if (isURI(field)) return field;
  try {
    const result = await jsonld.expand({ '@context': context, [field]: 'x' } as any);
    return Object.keys(result[0] || {}).find(isURI);
  } catch {
    return undefined;
  }
};

export type ServerListQuery = {
  /** Query string params filtering the container (`q`, `q-predicate`, `near`, `radius`) */
  params: URLSearchParams;
  sortPredicate?: string;
  sortOrder?: 'ASC' | 'DESC';
};

/**
 * Translate Refine's filters and sorters into the params supported by the Pod when fetching a container.
 * Returns `undefined` if some of them cannot be applied by the Pod, in which case everything is done in memory.
 *
 * Supported filters:
 * - `{ field: "q", operator: "contains", value }`: search in all the literals of the resources
 * - `{ field, operator: "contains", value }`: search in this field
 * - `{ operator: "or", value: [{ field, operator: "contains", value }, ...] }` with the same value: search in these fields
 * - `{ field: "near", operator: "eq", value: { latitude, longitude, radius } }`
 *
 * Only one search, and one sorter, can be applied by the Pod.
 */
export const buildServerListQuery = async (
  filters: CrudFilters | undefined,
  sorters: CrudSorting | undefined,
  context: JsonContext
): Promise<ServerListQuery | undefined> => {
  const params = new URLSearchParams();
  let search: { keywords: string; fields: string[] } | undefined;

  const addSearch = (keywords: string, fields: string[]) => {
    if (search) return false; // The Pod can only apply one search
    search = { keywords, fields };
    return true;
  };

  for (const filter of filters || []) {
    if (isConditionalFilter(filter)) {
      const children = filter.value;
      const keywords = (children[0] as LogicalFilter | undefined)?.value;
      const isSearch =
        filter.operator === 'or' &&
        children.length > 0 &&
        children.every(
          child =>
            !isConditionalFilter(child) &&
            child.operator === 'contains' &&
            child.field !== SEARCH_FIELD &&
            child.value === keywords
        );
      if (!isSearch) return undefined;
      if (
        keywords &&
        !addSearch(
          String(keywords),
          children.map(child => (child as LogicalFilter).field)
        )
      )
        return undefined;
    } else if (filter.operator === 'contains') {
      if (filter.value && !addSearch(String(filter.value), filter.field === SEARCH_FIELD ? [] : [filter.field])) {
        return undefined;
      }
    } else if (filter.field === NEAR_FIELD && filter.operator === 'eq') {
      if (filter.value) {
        const { latitude, longitude, radius } = filter.value as NearFilterValue;
        params.set('near', `${latitude},${longitude}`);
        params.set('radius', `${radius}`);
      }
    } else {
      return undefined;
    }
  }

  if (search) {
    params.set('q', search.keywords);
    for (const field of search.fields) {
      const predicate = await expandPredicate(field, context);
      if (!predicate) return undefined;
      params.append('q-predicate', predicate);
    }
  }

  if (sorters && sorters.length > 1) return undefined;
  const sorter = sorters?.[0] as CrudSort | undefined;
  let sortPredicate: string | undefined;
  if (sorter) {
    sortPredicate = await expandPredicate(sorter.field, context);
    if (!sortPredicate) return undefined;
  }

  return { params, sortPredicate, sortOrder: sorter ? (sorter.order === 'desc' ? 'DESC' : 'ASC') : undefined };
};
