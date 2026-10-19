import { useCallback, useEffect, useState } from 'react';
import urlJoin from 'url-join';
import { useDataProvider } from 'react-admin';
import useRealmContext from './useRealmContext';

export type GroupMember = { webId: string; roles: string[] };

const useGroupMembers = () => {
  const dataProvider = useDataProvider();
  const { data: group } = useRealmContext() as any;
  const [members, setMembers] = useState<GroupMember[]>();
  const [isLoading, setIsLoading] = useState(true);

  const username = group?.webIdData?.['foaf:nick'] || group?.webIdData?.preferredUsername;
  const endpoint = username && urlJoin(new URL(group.id).origin, '.account', username);

  const refetch = useCallback(async () => {
    const { json } = await dataProvider.fetch(urlJoin(endpoint, 'members'));
    setMembers(json);
    setIsLoading(false);
  }, [dataProvider, endpoint]);

  useEffect(() => {
    if (endpoint) refetch();
  }, [endpoint, refetch]);

  const send = useCallback(
    async (path: string, method: string, memberUri: string) => {
      await dataProvider.fetch(urlJoin(endpoint, path), {
        method,
        body: JSON.stringify({ memberUri }),
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
      await refetch();
    },
    [dataProvider, endpoint, refetch]
  );

  return {
    members,
    isLoading,
    refetch,
    addMember: (memberUri: string) => send('members', 'POST', memberUri),
    removeMember: (memberUri: string) => send('members', 'DELETE', memberUri),
    addOwner: (memberUri: string) => send('roles/owner/members', 'POST', memberUri),
    removeOwner: (memberUri: string) => send('roles/owner/members', 'DELETE', memberUri)
  };
};

export default useGroupMembers;
