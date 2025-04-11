import { useGetOne, useGetIdentity } from 'react-admin';
import { stripHtmlTags } from '../utils';
import useWebfingerId from './useWebfingerId';

const useActor = (actorUri: any, options = {}) => {
  // @ts-expect-error TS(2339): Property 'loadPrivateProfile' does not exist on ty... Remove this comment to see the full error message
  const { loadPrivateProfile = true } = options;
  const { data: identity } = useGetIdentity();

  const { data: webId, isLoading: isWebIdLoading } = useGetOne(
    'Actor',
    { id: actorUri },
    { enabled: !!actorUri, staleTime: Infinity }
  );

  const webfinger = useWebfingerId(actorUri);

  const { data: privateProfile, isLoading: isPrivateProfileLoading } = useGetOne(
    'Profile',
    { id: webId?.url },
    { enabled: !!webId?.url && loadPrivateProfile }
  );

  return {
    ...webId,
    uri: actorUri,
    isLoggedUser: actorUri === identity?.id,
    name: loadPrivateProfile
      ? privateProfile?.['vcard:given-name'] || webId?.name || webId?.['foaf:nick'] || webId?.preferredUsername
      : webId?.name || webId?.['foaf:nick'] || webId?.preferredUsername,
    image: loadPrivateProfile ? privateProfile?.['vcard:photo'] || webId?.icon?.url : webId?.icon?.url,
    summary: loadPrivateProfile
      ? privateProfile?.['vcard:note'] || stripHtmlTags(webId?.summary)
      : stripHtmlTags(webId?.summary),
    privateProfile,
    webfinger,
    isLoading: isWebIdLoading || isPrivateProfileLoading
  };
};

export default useActor;
