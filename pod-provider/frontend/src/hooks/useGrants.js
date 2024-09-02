import { useEffect, useState } from 'react';
import { arrayOf } from '../utils';
import { useDataProvider } from 'react-admin';

const useGrants = appUri => {
  const [grants, setGrants] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const dataProvider = useDataProvider();

  useEffect(() => {
    (async () => {
      let g = [];
      const { data: accessGrants } = await dataProvider.getList('AccessGrant', {
        filter: { 'http://www.w3.org/ns/solid/interop#grantee': appUri },
        pagination: { page: 1, perPage: Infinity }
      });
      for (const accessGrant of accessGrants) {
        if (accessGrant['apods:hasSpecialRights']) {
          g = [...g, ...arrayOf(accessGrant['apods:hasSpecialRights'])];
        }
        if (accessGrant['interop:hasDataGrant']) {
          const { data: dataGrants } = await dataProvider.getMany('DataGrant', {
            ids: arrayOf(accessGrant['interop:hasDataGrant'])
          });
          g = [...g, ...dataGrants];
        }
      }
      setGrants(g);
      setLoaded(true);
    })();
  }, [dataProvider, appUri, setGrants, setLoaded]);

  return { grants, loaded };
};

export default useGrants;
