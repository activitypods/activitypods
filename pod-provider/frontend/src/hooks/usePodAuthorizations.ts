import { useDataProvider } from 'react-admin';
import { useQuery } from '@tanstack/react-query';
import useRealmContext from './useRealmContext';
import { arrayOf } from '../utils';

// The access authorizations given to people and roles, found through the registry set of the pod
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

      // The authorizations are all in the same container, so it is quicker to fetch it than each of them
      const containerUri = authorizationsUris[0].substring(0, authorizationsUris[0].lastIndexOf('/'));
      const { json: container } = await dataProvider.fetch(containerUri);
      return arrayOf(container['ldp:contains']).filter(
        (authorization: any) =>
          authorizationsUris.includes(authorization.id || authorization['@id']) &&
          authorization['interop:granteeType'] === 'interop:SocialAgent'
      );
    },
    enabled: !!pod?.id
  });

  return data;
};

export default usePodAuthorizations;
