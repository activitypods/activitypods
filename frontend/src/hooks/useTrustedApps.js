import { useEffect, useState } from 'react';
import { useGetList } from 'react-admin';

const useTrustedApps = () => {
  const [trustedApps, setTrustedApps] = useState([]);

  const { data, isLoaded } = useGetList('TrustedApp', { pagination: { page: 1, perPage: 1000 } });

  useEffect(() => {
    if (isLoaded) {
      setTrustedApps(Object.values(data).map(app => app['apods:domainName']));
    }
  }, [isLoaded, data, setTrustedApps]);

  return trustedApps;
};

export default useTrustedApps;
