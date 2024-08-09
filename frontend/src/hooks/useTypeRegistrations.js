import { useEffect, useState, useCallback } from 'react';
import { useGetIdentity, useDataProvider } from 'react-admin';
import { arrayFromLdField } from '../utils';

const useTypeRegistrations = () => {
  const { data: identity } = useGetIdentity();
  const dataProvider = useDataProvider();
  const [typeRegistrations, setTypeRegistrations] = useState();

  const fetchTypeIndex = useCallback(async () => {
    const { json: typeIndex } = await dataProvider.fetch(identity?.webIdData?.['solid:publicTypeIndex']);
    if (typeIndex) {
      setTypeRegistrations(
        arrayFromLdField(typeIndex['solid:hasTypeRegistration']).map(reg => ({
          '@context': typeIndex['@context'],
          ...reg
        }))
      );
    }
  }, [identity, dataProvider, setTypeRegistrations]);

  useEffect(() => {
    if (identity?.webIdData?.['solid:publicTypeIndex']) {
      fetchTypeIndex();
    }
  }, [identity, fetchTypeIndex]);

  return { data: typeRegistrations, refetch: fetchTypeIndex };
};

export default useTypeRegistrations;
