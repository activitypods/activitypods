import { useState, useEffect } from 'react';
import urlJoin from 'url-join';
import { DataProvider, useDataProvider } from 'react-admin';
import { useCollection, useWebfinger } from '@semapps/activitypub-components';
import { getGroupEndpoint, GroupRights } from './useGroupRights';

export type Group = {
  id: string;
  name: string;
  avatar?: string;
  summary?: string;
  webfingerId: string;
  isMember: boolean;
  rights: GroupRights;
  webIdData: any;
};

const fetchGroup = async (dataProvider: DataProvider, groupUri: string): Promise<Group> => {
  const { data } = await dataProvider.getOne('Actor', { id: groupUri });
  let rights;
  try {
    ({ json: rights } = await dataProvider.fetch(urlJoin(getGroupEndpoint(data)!, 'me')));
  } catch (e) {
    // Not a member (403), or the group does not answer
  }
  return {
    id: data.id,
    name: data['foaf:name'] || data.name || data.preferredUsername,
    avatar: data.image?.url || data.image || data.icon?.url || data.icon,
    summary: data.summary,
    webfingerId: `@${data['foaf:nick'] || data.preferredUsername}@${new URL(data.id).host}`,
    isMember: !!rights,
    rights: rights || { roles: [], specialRights: [] },
    webIdData: data
  };
};

// Groups listed in the user's apods:groups collection, which confirm the membership
const useGroups = () => {
  const dataProvider = useDataProvider();
  const { items, isLoading: isCollectionLoading, refetch } = useCollection('apods:groups');
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const groupsKey = (items || []).join(' ');

  useEffect(() => {
    if (isCollectionLoading) return;
    const uris = groupsKey ? groupsKey.split(' ') : [];
    Promise.all(uris.map(groupUri => fetchGroup(dataProvider, groupUri).catch(() => undefined))).then(results => {
      setGroups(results.filter((group): group is Group => !!group?.isMember));
      setIsLoading(false);
    });
  }, [dataProvider, groupsKey, isCollectionLoading]);

  return { groups, isLoading, refetch };
};

export const useGroup = (webfingerId?: string) => {
  const dataProvider = useDataProvider();
  const webfinger = useWebfinger();
  const [group, setGroup] = useState<Group>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!webfingerId) return;
    setIsLoading(true);
    (webfingerId.startsWith('http') ? Promise.resolve(webfingerId) : webfinger.fetch(webfingerId))
      .then(groupUri => (groupUri ? fetchGroup(dataProvider, groupUri) : undefined))
      .catch(() => undefined)
      .then(result => {
        setGroup(result);
        setIsLoading(false);
      });
  }, [dataProvider, webfinger.fetch, webfingerId]);

  return { group, isLoading };
};

export default useGroups;
