import { useState, useEffect } from 'react';
import urlJoin from 'url-join';
import { useDataProvider } from 'react-admin';
import { useCollection } from '@semapps/activitypub-components';
import { getGroupEndpoint, GroupRights } from './useGroupRights';

export type Group = {
  id: string;
  name: string;
  avatar?: string;
  summary?: string;
  webfingerId: string;
  rights: GroupRights;
  webIdData: any;
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
    Promise.all(
      uris.map(async (groupUri): Promise<Group | undefined> => {
        try {
          const { data } = await dataProvider.getOne('Actor', { id: groupUri });
          const { json } = await dataProvider.fetch(urlJoin(getGroupEndpoint(data)!, 'me'));
          return {
            id: data.id,
            name: data['foaf:name'] || data.name || data.preferredUsername,
            avatar: data.image?.url || data.image || data.icon?.url || data.icon,
            summary: data.summary,
            webfingerId: `@${data['foaf:nick'] || data.preferredUsername}@${new URL(data.id).host}`,
            rights: json,
            webIdData: data
          };
        } catch (e) {
          return undefined;
        }
      })
    ).then(results => {
      setGroups(results.filter((group): group is Group => !!group));
      setIsLoading(false);
    });
  }, [dataProvider, groupsKey, isCollectionLoading]);

  return { groups, isLoading, refetch };
};

export default useGroups;
