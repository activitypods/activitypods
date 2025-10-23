import { useCallback, useState, useEffect } from 'react';
import { useDataProvider, useGetIdentity } from 'react-admin';
import urlJoin from 'url-join';

const useAgentRegistration = agentUri => {
  const [agentRegistration, setAgentRegistration] = useState();
  const [loaded, setLoaded] = useState(false);
  const dataProvider = useDataProvider();
  const { data: identity } = useGetIdentity();

  const fetchAgentRegistration = useCallback(async () => {
    const oidcIssuer = identity?.webIdData?.['solid:oidcIssuer'] || new URL(identity?.id).origin;
    const endpointUrl = new URL(urlJoin(oidcIssuer, '.auth-agent/app-registrations'));
    endpointUrl.searchParams.append('agent', agentUri);

    const { json } = await dataProvider.fetch(endpointUrl.toString());
    if (json) {
      setAgentRegistration(json);
      setLoaded(true);
    } else {
      throw new Error(`Unable to fetch ${endpointUrl}`);
    }
  }, [dataProvider, identity, setAgentRegistration]);

  useEffect(() => {
    if (identity?.webIdData) {
      fetchAgentRegistration();
    }
  }, [fetchAgentRegistration, identity]);

  return { agentRegistration, loaded, refetch: fetchAgentRegistration };
};

export default useAgentRegistration;
