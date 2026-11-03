import { useActiveAuthProvider } from '@refinedev/core';
import type { AuthProvider } from '@activitypods/refine-providers';

const useAuthProvider = () => {
  const authProvider = useActiveAuthProvider() as Partial<AuthProvider> | null;
  if (!authProvider?.getSession) {
    throw new Error('Refine must be given an authProvider created with @activitypods/refine-providers');
  }
  return authProvider as AuthProvider;
};

export default useAuthProvider;
