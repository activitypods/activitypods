import { useCallback, useEffect, useState } from 'react';
import urlJoin from 'url-join';
import { useDataProvider } from 'react-admin';
import useRealmContext from './useRealmContext';

export type GroupRights = { roles: { id: string; label: string }[]; specialRights: string[] };

// Remote groups endpoints are reached through the proxy of the user's server
export const getGroupEndpoint = (groupActor: any) => {
  const username = groupActor?.['foaf:nick'] || groupActor?.preferredUsername;
  return username ? urlJoin(new URL(groupActor.id).origin, '.account', username) : undefined;
};

const useGroupRights = () => {
  const dataProvider = useDataProvider();
  const { data: group } = useRealmContext() as any;
  const [rights, setRights] = useState<GroupRights>();
  const [isLoading, setIsLoading] = useState(true);

  const endpoint = group?.webIdData && getGroupEndpoint(group.webIdData);

  const refetch = useCallback(async () => {
    try {
      const { json } = await dataProvider.fetch(urlJoin(endpoint!, 'me'));
      setRights(json);
    } catch (e) {
      setRights({ roles: [], specialRights: [] });
    } finally {
      setIsLoading(false);
    }
  }, [dataProvider, endpoint]);

  useEffect(() => {
    if (endpoint) refetch();
  }, [endpoint, refetch]);

  return {
    endpoint,
    isLoading,
    refetch,
    isOwner: !!rights?.roles.some(role => role.id === 'owner'),
    rights: rights?.specialRights || []
  };
};

export default useGroupRights;
