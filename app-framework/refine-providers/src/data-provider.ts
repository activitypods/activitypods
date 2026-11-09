import type { DataProvider } from '@refinedev/core';
import LinkHeader from 'http-link-header';
import {
  applyFilters,
  applySorters,
  arrayOf,
  buildServerListQuery,
  DEFAULT_CONTEXT,
  discoverSharedSources,
  fetchJson,
  fetchWithSession,
  normalizeRecord,
  resolveContainerUri,
  resolveResourceTypes
} from './utils';
import { DataProviderConfig, ResourceConfig } from './types';

/**
 * Refine data provider for ActivityPods. Resources are mapped to LDP containers, discovered
 * at runtime from the logged-in user's public Solid TypeIndex (linked from their WebID as
 * `solid:publicTypeIndex`) — the same mechanism the Pod uses to register a container the
 * first time a shape tree's access is granted.
 *
 * With `pagination: { mode: "server" }`, `getList` asks the Pod for a single page of the container,
 * filtered and sorted by the Pod (see `buildServerListQuery` for the supported filters). If some
 * filters or sorters can't be applied by the Pod, or if the Pod doesn't support paging, the full
 * container is fetched and Refine's filters, sorters and pagination are applied in memory.
 */
const dataProvider = ({
  resources,
  authProvider,
  jsonContext = DEFAULT_CONTEXT,
  readAccessGrants = false
}: DataProviderConfig): DataProvider => {
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

  const resolveContainer = async (resource: string) => {
    const { token, webId } = requireSession();
    return resolveContainerUri(resource, requireResourceConfig(resource), webId, token, jsonContext);
  };

  const fetchOne = async (id: string) => {
    const { json } = await fetchWithSession(id, {}, requireSession());
    return normalizeRecord(json, json['@context']);
  };

  const fetchSharedRecords = async (resource: string) => {
    if (!readAccessGrants) return [];
    const session = requireSession();
    const resourceConfig = requireResourceConfig(resource);
    const types = await resolveResourceTypes(resourceConfig, jsonContext);
    const sources = await discoverSharedSources(resourceConfig, types, session).catch(() => []);
    const results = await Promise.allSettled(
      sources.flatMap(source =>
        'containerUri' in source
          ? [
              fetchWithSession(source.containerUri, {}, session).then(({ json }) =>
                arrayOf(json['ldp:contains']).map(item => normalizeRecord(item, json['@context']))
              )
            ]
          : source.resourceUris.map(uri => fetchOne(uri).then(record => [record]))
      )
    );
    return results.flatMap(result => (result.status === 'fulfilled' ? result.value : []));
  };

  const list: DataProvider['getList'] = async ({ resource, pagination, sorters, filters }) => {
    const { token } = requireSession();
    const [containerUri, sharedRecords] = await Promise.all([resolveContainer(resource), fetchSharedRecords(resource)]);

    const serverQuery = await buildServerListQuery(filters, sorters, jsonContext);
    // The Pod can't page the shared resources along with the user's own
    const serverPaging = pagination?.mode === 'server' && !!serverQuery && sharedRecords.length === 0;
    const currentPage = pagination?.currentPage ?? 1;
    const pageSize = pagination?.pageSize ?? 10;

    let url = containerUri;
    const headers = new Headers();
    if (serverQuery) {
      // Filters are always sent: they are applied again in memory below, unless the Pod paged the results
      const params = new URLSearchParams(serverQuery.params);
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
      if (params.size > 0) url = `${containerUri}?${params.toString()}`;
    }

    const { json: container, headers: responseHeaders } = await fetchJson(url, { headers }, token);
    let records = arrayOf(container['ldp:contains']).map(item => normalizeRecord(item, container['@context']));

    if (serverPaging && responseHeaders.get('Preference-Applied')?.includes('max-member-count')) {
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

    const ownIds = new Set(records.map(record => record.id));
    records = [...records, ...sharedRecords.filter(record => !ownIds.has(record.id))];

    records = applyFilters(records, filters);
    records = applySorters(records, sorters);

    const total = records.length;

    if (pagination && pagination.mode !== 'off') {
      records = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    }

    return { data: records as any, total };
  };

  return {
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
      const { token } = requireSession();
      const resourceConfig = requireResourceConfig(resource);
      const containerUri = await resolveContainer(resource);
      const types = await resolveResourceTypes(resourceConfig, jsonContext);

      const { headers } = await fetchJson(
        containerUri,
        {
          method: 'POST',
          body: JSON.stringify({ '@context': jsonContext, '@type': types, ...variables })
        },
        token
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
      await fetchWithSession(
        `${id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            '@context': [...arrayOf(jsonContext), ...arrayOf(currentContext)],
            ...current,
            ...variables
          })
        },
        session
      );

      return { data: (await fetchOne(`${id}`)) as any };
    },

    deleteOne: async ({ resource, id }) => {
      const session = requireSession();
      requireResourceConfig(resource);
      await fetchWithSession(`${id}`, { method: 'DELETE' }, session);
      return { data: { id } as any };
    }
  };
};

export default dataProvider;
