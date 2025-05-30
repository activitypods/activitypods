import { useCallback, useEffect, useState } from 'react';
import { arrayOf } from '../utils';
import { useDataProvider } from 'react-admin';

const useGrants = appUri => {
  const [grants, setGrants] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const dataProvider = useDataProvider();

  const fetchGrants = useCallback(async () => {
    let g = [];
    const { data: accessGrants } = await dataProvider.getList('AccessGrant', {
      filter: { 'http://www.w3.org/ns/solid/interop#grantee': appUri },
      pagination: { page: 1, perPage: Infinity }
    });
    for (const accessGrant of accessGrants) {
      if (accessGrant['apods:hasSpecialRights']) {
        g = [...g, ...arrayOf(accessGrant['apods:hasSpecialRights'])];
      }
      // TODO Refactor
      if (accessGrant['interop:hasDataGrant']) {
        const { data: dataGrants } = await dataProvider.getMany('DataGrant', {
          ids: arrayOf(accessGrant['interop:hasDataGrant'])
        });
        g = [...g, ...dataGrants];
      }
    }
    setGrants(g);
    setLoaded(true);
  }, [dataProvider, appUri, setGrants, setLoaded]);

  useEffect(() => {
    fetchGrants();
  }, [fetchGrants]);

  return { grants, loaded, refetch: fetchGrants };
};

export default useGrants;
