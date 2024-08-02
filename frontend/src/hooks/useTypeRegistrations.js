import { useEffect, useState } from 'react';
import { useGetIdentity, useDataProvider } from 'react-admin';

const useTypeRegistrations = () => {
  const { data: identity } = useGetIdentity();
  const dataProvider = useDataProvider();
  const [typeRegistrations, setTypeRegistrations] = useState();

  useEffect(() => {
    (async () => {
      if (identity?.webIdData?.['solid:publicTypeIndex']) {
        const { json: typeIndex } = await dataProvider.fetch(identity?.webIdData?.['solid:publicTypeIndex']);
        if (typeIndex) {
          setTypeRegistrations(
            typeIndex['solid:hasTypeRegistration'].map(reg => ({ '@context': typeIndex['@context'], ...reg }))
          );
        }
      }
    })();
  }, [dataProvider, identity, setTypeRegistrations]);

  return typeRegistrations;
};

export default useTypeRegistrations;
