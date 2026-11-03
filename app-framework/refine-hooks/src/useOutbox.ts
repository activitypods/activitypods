import { useCallback } from 'react';
import { useGetIdentity } from '@refinedev/core';
import { DEFAULT_CONTEXT, fetchJson, type Identity, type JsonContext } from '@activitypods/refine-providers';
import useAuthProvider from './useAuthProvider';

const useOutbox = ({ jsonContext = DEFAULT_CONTEXT }: { jsonContext?: JsonContext } = {}) => {
  const authProvider = useAuthProvider();
  const { data: identity } = useGetIdentity<Identity>();
  const url: string | undefined = identity?.webIdData?.outbox;

  const post = useCallback(
    async (activity: Record<string, any>) => {
      if (!url) throw new Error('The outbox is not loaded yet');
      const { headers } = await fetchJson(
        url,
        { method: 'POST', body: JSON.stringify({ '@context': jsonContext, ...activity }) },
        authProvider.getSession()?.token
      );
      return headers.get('Location') ?? undefined;
    },
    [url, jsonContext, authProvider]
  );

  return { post, url, owner: identity?.id };
};

export default useOutbox;
