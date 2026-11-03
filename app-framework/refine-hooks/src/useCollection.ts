import { useCallback, useMemo } from 'react';
import { useGetIdentity } from '@refinedev/core';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { arrayOf, fetchWithSession, type Identity } from '@activitypods/refine-providers';
import useAuthProvider from './useAuthProvider';

type CollectionPage = { items: any[]; next?: string };

const EMPTY_ITEMS: any[] = [];

const getId = (value: any): string | undefined => (typeof value === 'string' ? value : value?.id || value?.['@id']);

/**
 * Read an ActivityPub collection, given its URI or a predicate of the user's WebID (e.g. `apods:contacts`).
 * Collections hosted on other servers are fetched through the user's Pod proxy.
 */
const useCollection = (predicateOrUri?: string) => {
  const authProvider = useAuthProvider();
  const { data: identity } = useGetIdentity<Identity>();
  const queryClient = useQueryClient();
  const session = authProvider.getSession();

  const url: string | undefined = predicateOrUri?.startsWith('http')
    ? predicateOrUri
    : predicateOrUri && getId(identity?.webIdData?.[predicateOrUri]);

  const queryKey = useMemo(() => ['activitypods', 'collection', url, session?.webId], [url, session?.webId]);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<CollectionPage> => {
      let { json } = await fetchWithSession(pageParam || url!, {}, session);
      if (!pageParam && json.first) {
        const firstPageInlined = json.first.items || json.first.orderedItems;
        json = firstPageInlined ? json.first : (await fetchWithSession(getId(json.first)!, {}, session)).json;
      }
      return { items: arrayOf(json.orderedItems || json.items), next: getId(json.next) };
    },
    initialPageParam: '',
    getNextPageParam: lastPage => lastPage.next,
    enabled: !!url,
    // Retrying a 403 is pointless
    retry: false
  });

  const items = useMemo(() => query.data?.pages.flatMap(page => page.items) ?? EMPTY_ITEMS, [query.data]);

  const updateFirstPage = useCallback(
    (update: (items: any[]) => any[]) =>
      queryClient.setQueryData<InfiniteData<CollectionPage>>(
        queryKey,
        data =>
          data && {
            ...data,
            pages: data.pages.map((page, i) => (i === 0 ? { ...page, items: update(page.items) } : page))
          }
      ),
    [queryClient, queryKey]
  );

  const addItem = useCallback((item: any) => updateFirstPage(items => [item, ...items]), [updateFirstPage]);

  const removeItem = useCallback(
    (item: any) => updateFirstPage(items => items.filter(i => getId(i) !== getId(item))),
    [updateFirstPage]
  );

  return {
    items,
    url,
    isLoading: query.isLoading,
    isSuccess: query.isSuccess,
    error: query.error,
    refetch: query.refetch,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    addItem,
    removeItem
  };
};

export default useCollection;
