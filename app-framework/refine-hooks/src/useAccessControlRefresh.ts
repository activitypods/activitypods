import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onAppGrantsChange } from '@activitypods/refine-providers';

/** Check the rights again (`useCan`, buttons) when the access grants of the app change */
const useAccessControlRefresh = () => {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      onAppGrantsChange(() => queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === 'access' })),
    [queryClient]
  );
};

export default useAccessControlRefresh;
