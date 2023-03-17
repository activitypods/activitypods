import { useEffect, useState } from "react";
import { useQueryWithStore } from "react-admin";

const useTrustedApps = () => {
  const [trustedApps, setTrustedApps] = useState([]);

  const { loaded, data } = useQueryWithStore({
    type: 'getList',
    resource: 'TrustedApp',
    payload: { pagination: { page: 1, perPage: 1000 } }
  });

  useEffect(() => {
    if (loaded) {
      setTrustedApps(Object.values(data).map(app => app['apods:domainName']))
    }
  }, [loaded, data, setTrustedApps]);

  return trustedApps;
};

export default useTrustedApps;
