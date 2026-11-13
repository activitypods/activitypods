import { useDataProvider } from 'react-admin';
import { useQuery } from '@tanstack/react-query';
import { useContainers, fetchDataRegistryContainers } from '@semapps/semantic-data-provider';
import useRealmContext from './useRealmContext';

// The data servers only include the containers of the logged user, so those of a group are fetched separately
const usePodContainers = () => {
  const { isGroup, data: pod } = useRealmContext() as any;
  const dataProvider = useDataProvider();
  const userContainers = useContainers(undefined, '@default');

  const { data: groupContainers } = useQuery({
    queryKey: ['podContainers', pod?.id],
    queryFn: () => fetchDataRegistryContainers(pod.id, dataProvider.fetch),
    enabled: isGroup && !!pod?.id
  });

  return isGroup ? groupContainers : userContainers;
};

export default usePodContainers;
