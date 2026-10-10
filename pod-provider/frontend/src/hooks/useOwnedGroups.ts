import { useState, useEffect } from 'react';
import urlJoin from 'url-join';
import { useDataProvider, useGetIdentity } from 'react-admin';

const useOwnedGroups = () => {
  const dataProvider = useDataProvider();
  const { data: identity } = useGetIdentity();
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    if (identity?.id) {
      // @ts-expect-error TS(2345): Argument of type 'Identifier' is not assignable to... Remove this comment to see the full error message
      const podProviderUrl = new URL(identity.id).origin;
      dataProvider
        .fetch(urlJoin(podProviderUrl, '.account/groups'))
        .then(({ json }: any) =>
          dataProvider.getMany('Actor', {
            ids: json
          })
        )
        .then(({ data }: any) => {
          setGroups(data);
        });
    }
  }, [dataProvider, identity, setGroups]);

  return groups;
};

export default useOwnedGroups;
