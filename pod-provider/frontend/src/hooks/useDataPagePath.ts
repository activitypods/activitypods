import { useCallback } from 'react';
import useRealmContext from './useRealmContext';

const useDataPagePath = () => {
  const { isGroup, data: pod } = useRealmContext() as any;
  return useCallback(
    (resourceUri?: string) =>
      `${isGroup ? `/group/${pod?.webfingerId}` : ''}/data${resourceUri ? `/${encodeURIComponent(resourceUri)}` : ''}`,
    [isGroup, pod]
  );
};

export default useDataPagePath;
