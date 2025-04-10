import { useState, useEffect } from 'react';
import urlJoin from 'url-join';
import { useDataProvider, useGetIdentity } from 'react-admin';

const useOwnedGroups = () => {
  const dataProvider = useDataProvider();
  const { data: identity } = useGetIdentity();
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    if (identity?.id) {
      const podProviderUrl = new URL(identity.id).origin;
      dataProvider
        .fetch(urlJoin(podProviderUrl, '.account/groups'))
        .then(({ json }) =>
          dataProvider.getMany('Actor', {
            ids: json
          })
        )
        .then(({ data }) => {
          setGroups(data);
        });
    }
  }, [dataProvider, identity, setGroups]);

  return groups;
};

export default useOwnedGroups;
