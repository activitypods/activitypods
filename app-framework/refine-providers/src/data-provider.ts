import type { DataProvider } from '@refinedev/core';
import LinkHeader from 'http-link-header';
import { storagesResolver } from './storages';
import { getDataRegistrationFromHeaders, invalidateAppGrants, rememberDataRegistration } from './grants';
import {
  applyFilters,
  applySorters,
  arrayOf,
  buildServerListQuery,
  DEFAULT_CONTEXT,
  fetchWithSession,
  findContainerUri,
  normalizeRecord,
  resolveResourceTypes
} from './utils';
import { ActivityPodsDataProvider, DataProviderConfig, ResourceConfig } from './types';

/**
 * Refine data provider for ActivityPods. Resources are mapped to LDP containers, discovered at
 * runtime in each storage: the Pod of the logged-in user (`@user`), the storages given in the
 * config (e.g. owned by the app or a group), and the storages shared with the app (`@shared`).
 * Public data can be read without being logged in.
 *
 * With `pagination: { mode: "server" }`, `getList` asks the Pod for a single page of the container,
 * filtered and sorted by the Pod (see `buildServerListQuery` for the supported filters). If some
 * filters or sorters can't be applied by the Pod, if the resource is read from several containers,
 * or if the Pod doesn't support paging, the containers are fully fetched and Refine's filters,
 * sorters and pagination are applied in memory. Records read with `getList` get the URI of their
 * storage in `_storage`.
 */
const dataProvider = ({
  resources,
  storages = {},
  authProvider,
  jsonContext = DEFAULT_CONTEXT,
  readAccessGrants = false
}: DataProviderConfig): ActivityPodsDataProvider => {
  const { getStorageUri, resolveListSources } = storagesResolver({
    resources,
    storages,
    jsonContext,
    readAccessGrants
  });

  const requireSession = () => {
    const session = authProvider.getSession();
    if (!session) throw new Error('Not authenticated');
    return session;
  };

  const requireResourceConfig = (resource: string): ResourceConfig => {
    const resourceConfig = resources[resource];
    if (!resourceConfig) throw new Error(`Resource "${resource}" is not configured`);
    return resourceConfig;
  };

  const fetchOne = async (id: string) => {
    const { json, headers } = await fetchWithSession(id, {}, authProvider.getSession());
    rememberDataRegistration(id, getDataRegistrationFromHeaders(headers));
    return normalizeRecord(json, json['@context']);
  };

  // The rights of the app may have been reduced since its grants were loaded
  const write = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e: any) {
      if (e?.status === 403) invalidateAppGrants(authProvider.getSession()?.webId);
      throw e;
    }
  };

  const list: DataProvider['getList'] = async ({ resource, pagination, sorters, filters }) => {
    const session = authProvider.getSession();
    const sources = await resolveListSources(resource, session);

    const serverQuery = await buildServerListQuery(filters, sorters, jsonContext);
    // The Pod can only page the results of a single container
    const serverPaging =
      pagination?.mode === 'server' &&
      !!serverQuery &&
      sources.containers.length === 1 &&
      sources.resources.length === 0;
    const currentPage = pagination?.currentPage ?? 1;
    const pageSize = pagination?.pageSize ?? 10;

    const params = new URLSearchParams(serverQuery?.params);
    const headers = new Headers();
    if (serverQuery) {
      // Filters are always sent: they are applied again in memory below, unless the Pod paged the results
      if (serverPaging) {
        params.set('page', `${currentPage}`);
        // Sorting is only delegated to the Pod with paging, as it may differ from the in-memory sorting
        // (SPARQL compares strings by code points, so it is case and accent sensitive)
        headers.set(
          'Prefer',
          [
            'return=representation',
            `max-member-count="${pageSize}"`,
            ...(serverQuery.sortPredicate
              ? [`sort-predicate="${serverQuery.sortPredicate}"`, `sort-order="${serverQuery.sortOrder}"`]
              : [])
          ].join('; ')
        );
      }
    }
    const withParams = (uri: string) => (params.size > 0 ? `${uri}?${params.toString()}` : uri);
    // In ActivityPods, the containers are the data registrations
    const tag = (record: Record<string, any>, storage: string, containerUri?: string): Record<string, any> => {
      rememberDataRegistration(record.id, containerUri);
      return { ...record, _storage: storage };
    };

    const inMemory = (records: Record<string, any>[]) => {
      records = applySorters(applyFilters(records, filters), sorters);
      const total = records.length;
      if (pagination && pagination.mode !== 'off') {
        records = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      }
      return { data: records as any, total };
    };

    if (serverPaging) {
      const [{ uri, storage }] = sources.containers;
      const { json: container, headers: responseHeaders } = await fetchWithSession(
        withParams(uri),
        { headers },
        session
      );
      const records = arrayOf(container['ldp:contains']).map(item =>
        tag(normalizeRecord(item, container['@context']), storage, uri)
      );
      if (!responseHeaders.get('Preference-Applied')?.includes('max-member-count')) return inMemory(records);

      const links = LinkHeader.parse(responseHeaders.get('Link') || '');
      const hasNextPage = links.has('rel', 'next');
      const lastPageUri = links.get('rel', 'last')[0]?.uri;
      const lastPage = lastPageUri ? Number(new URL(lastPageUri).searchParams.get('page')) || currentPage : currentPage;
      return {
        data: records as any,
        // The Pod doesn't return the number of resources, so it is exact only on the last page
        total: hasNextPage
          ? Math.max(lastPage, currentPage + 1) * pageSize
          : (currentPage - 1) * pageSize + records.length,
        cursor: {
          next: hasNextPage ? currentPage + 1 : undefined,
          prev: currentPage > 1 ? currentPage - 1 : undefined
        }
      };
    }

    const results = await Promise.allSettled([
      ...sources.containers.map(({ uri, storage }) =>
        fetchWithSession(withParams(uri), {}, session).then(({ json }) =>
          arrayOf(json['ldp:contains']).map(item => tag(normalizeRecord(item, json['@context']), storage, uri))
        )
      ),
      ...sources.resources.map(({ uri, storage }) => fetchOne(uri).then(record => [tag(record, storage)]))
    ]);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    failures.forEach(failure => console.warn(`Could not list resources of "${resource}"`, failure.reason));
    // No access (anymore) is not an error: the data is just not visible
    const errors = failures.filter(failure => failure.reason?.status !== 403);
    if (errors.length > 0 && failures.length === results.length) throw errors[0].reason;

    const recordsById = new Map<string, Record<string, any>>();
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const record of result.value) if (!recordsById.has(record.id)) recordsById.set(record.id, record);
      }
    }
    return inMemory([...recordsById.values()]);
  };

  return {
    getConfig: () => ({ resources, storages, authProvider, jsonContext, readAccessGrants }),

    getApiUrl: () => '',

    getList: list,

    getOne: async ({ resource, id }) => {
      requireResourceConfig(resource);
      return { data: (await fetchOne(`${id}`)) as any };
    },

    getMany: async ({ resource, ids }) => {
      requireResourceConfig(resource);
      const results = await Promise.allSettled(ids.map(id => fetchOne(`${id}`)));
      const data = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled').map(r => r.value);
      return { data: data as any };
    },

    create: async ({ resource, variables }) => {
      const session = requireSession();
      const resourceConfig = requireResourceConfig(resource);
      const storageKey = resourceConfig.create?.storage ?? '@user';
      if (storageKey === '@all' || storageKey === '@shared') {
        throw new Error(`Resource "${resource}" must be created in a single storage, not ${storageKey}`);
      }
      const storageUri = getStorageUri(storageKey, session)!;
      const types = await resolveResourceTypes(resourceConfig, jsonContext);
      const containerUri = await findContainerUri(storageUri, resourceConfig, types, session);
      if (!containerUri) {
        throw new Error(`No container found in ${storageUri} to create a resource "${resource}"`);
      }

      const { headers } = await write(() =>
        fetchWithSession(
          containerUri,
          {
            method: 'POST',
            body: JSON.stringify({ '@context': jsonContext, '@type': types, ...variables })
          },
          session
        )
      );

      const location = headers.get('Location');
      if (!location)
        throw new Error(`The Pod did not return a Location header when creating a resource in ${containerUri}`);

      return { data: (await fetchOne(location)) as any };
    },

    update: async ({ resource, id, variables }) => {
      const session = requireSession();
      requireResourceConfig(resource);

      // Get the current version of the resource to reduce the risk of overwriting
      // predicates that have been added by the backend
      const { id: _id, '@context': currentContext, ...current } = await fetchOne(`${id}`);

      // `current`'s keys were compacted with the resource's own context (e.g. the Pod's
      // `dc:created`), which jsonContext doesn't necessarily define: sending it alone stored them
      // as bogus absolute IRIs like <dc:created>. Listed last, so it wins for `current`'s keys.
      await write(() =>
        fetchWithSession(
          `${id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              '@context': [...arrayOf(jsonContext), ...arrayOf(currentContext)],
              ...current,
              ...variables,
              _storage: undefined
            })
          },
          session
        )
      );

      return { data: (await fetchOne(`${id}`)) as any };
    },

    deleteOne: async ({ resource, id }) => {
      const session = requireSession();
      requireResourceConfig(resource);
      await write(() => fetchWithSession(`${id}`, { method: 'DELETE' }, session));
      return { data: { id } as any };
    }
  };
};

export default dataProvider;
