import { useGetOne } from 'react-admin';

const useWebfingerId = actorUri => {
  const { data: webId } = useGetOne('Actor', { id: actorUri }, { enabled: !!actorUri, staleTime: Infinity });

  return webId?.preferredUsername ? `@${webId.preferredUsername}@${new URL(actorUri).host}` : undefined;
};

export default useWebfingerId;
