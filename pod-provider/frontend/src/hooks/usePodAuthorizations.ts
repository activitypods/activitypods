import { useDataProvider } from 'react-admin';
import { useQuery } from '@tanstack/react-query';
import useRealmContext from './useRealmContext';
import { arrayOf } from '../utils';

// The access authorizations given to people, roles and the public, found through the registry set of the pod
const usePodAuthorizations = () => {
  const { data: pod } = useRealmContext() as any;
  const dataProvider = useDataProvider();

  const { data } = useQuery({
    queryKey: ['podAuthorizations', pod?.id],
    queryFn: async () => {
      const { json: agent } = await dataProvider.fetch(pod.id);
      const { json: registrySet } = await dataProvider.fetch(agent['interop:hasRegistrySet']);
      const { json: registry } = await dataProvider.fetch(registrySet['interop:hasAuthorizationRegistry']);
      const authorizationsUris = arrayOf(registry['interop:hasAccessAuthorization']);
      if (authorizationsUris.length === 0) return [];

      // The URI of a resource doesn't give its container, so each authorization is fetched
      const authorizations = await Promise.all(
        authorizationsUris.map(async (uri: string) => (await dataProvider.fetch(uri)).json)
      );
      // Shared with everyone or with all authenticated agents, there is no grantee type
      return authorizations.filter(
        (authorization: any) => authorization['interop:granteeType'] !== 'interop:Application'
      );
    },
    enabled: !!pod?.id
  });

  return data;
};

export default usePodAuthorizations;
