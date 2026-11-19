import { useQuery } from '@tanstack/react-query';
import { canWriteResource } from '@activitypods/refine-providers';
import useAuthProvider from './useAuthProvider';

/** Whether the logged-in user may modify a resource through the app, based on the app's access grants */
const useCanEdit = (resourceUri?: string) => {
  const authProvider = useAuthProvider();
  const session = authProvider.getSession();

  const { data, isLoading } = useQuery({
    queryKey: ['activitypods', 'canEdit', resourceUri, session?.webId],
    queryFn: () => canWriteResource(resourceUri!, session),
    enabled: !!resourceUri && !!session
  });

  return { canEdit: !!session && !!data, isLoading: !!resourceUri && !!session && isLoading };
};

export default useCanEdit;
