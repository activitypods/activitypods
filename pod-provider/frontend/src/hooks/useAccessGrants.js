import { useCallback, useEffect, useState } from 'react';
import { useDataProvider } from 'react-admin';

const useAccessGrants = agentUri => {
  const [accessGrants, setAccessGrants] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const dataProvider = useDataProvider();

  const fetchAccessGrants = useCallback(async () => {
    const { data: accessGrants } = await dataProvider.getList('AccessGrant', {
      filter: { 'http://www.w3.org/ns/solid/interop#grantee': agentUri },
      pagination: { page: 1, perPage: Infinity }
    });

    setAccessGrants(accessGrants);
    setLoaded(true);
  }, [dataProvider, agentUri, setAccessGrants, setLoaded]);

  useEffect(() => {
    fetchAccessGrants();
  }, [fetchAccessGrants]);

  return { accessGrants, loaded, refetch: fetchAccessGrants };
};

export default useAccessGrants;
