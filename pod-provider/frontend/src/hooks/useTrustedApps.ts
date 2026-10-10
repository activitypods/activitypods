import { useEffect, useState } from 'react';
import { useGetList } from 'react-admin';

const useTrustedApps = () => {
  const [trustedApps, setTrustedApps] = useState([]);

  // @ts-expect-error TS(2339): Property 'isLoaded' does not exist on type 'UseGet... Remove this comment to see the full error message
  const { data, isLoaded } = useGetList('TrustedApp', { pagination: { page: 1, perPage: 1000 } });

  useEffect(() => {
    if (isLoaded) {
      // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
      setTrustedApps(Object.values(data).map(app => app['apods:baseUrl']));
    }
  }, [isLoaded, data, setTrustedApps]);

  return trustedApps;
};

export default useTrustedApps;
