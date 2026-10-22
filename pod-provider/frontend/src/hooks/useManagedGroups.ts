import { useState, useEffect } from 'react';
import urlJoin from 'url-join';
import { useDataProvider } from 'react-admin';
import { useCollection } from '@semapps/activitypub-components';
import { getGroupEndpoint } from './useGroupRights';

// Groups in which the user has at least one special right
const useManagedGroups = () => {
  const dataProvider = useDataProvider();
  const { items: groupsUris } = useCollection('apods:groups');
  const [groups, setGroups] = useState<any[]>([]);
  const groupsKey = (groupsUris || []).join(' ');

  useEffect(() => {
    const uris = groupsKey ? groupsKey.split(' ') : [];
    if (uris.length === 0) {
      setGroups([]);
      return;
    }
    Promise.all(
      uris.map(async groupUri => {
        try {
          const { data: group } = await dataProvider.getOne('Actor', { id: groupUri });
          const { json } = await dataProvider.fetch(urlJoin(getGroupEndpoint(group)!, 'me'));
          return json.specialRights.length > 0 ? group : undefined;
        } catch (e) {
          return undefined;
        }
      })
    ).then(results => setGroups(results.filter(group => group)));
  }, [dataProvider, groupsKey]);

  return groups;
};

export default useManagedGroups;
