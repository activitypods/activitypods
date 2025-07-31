import { useState, useEffect } from 'react';
import { useDataProvider, useGetIdentity, useGetList } from 'react-admin';
import { createContactCapability } from '../utils';
import { SemanticDataProvider } from '@semapps/semantic-data-provider';
import { useQueryClient } from 'react-query';

const inviteLinkFromCapUri = (capUri: string) => {
  return `${new URL(window.location.href).origin}/invite/${encodeURIComponent(capUri)}`;
};
/**
 * Loads or creates a contact link.
 * @returns A contact link that can be used to invite others to one's profile.
 */
const useContactLink = () => {
  const { data: identity } = useGetIdentity();
  const { fetch: fetchFn } = useDataProvider<SemanticDataProvider>();
  const profileData = identity?.profileData;
  const webIdDoc = identity?.webIdData;

  const { data: credentials, isSuccess: credentialsLoaded } = useGetList('VerifiableCredential');
  const queryClient = useQueryClient();

  const [contactLink, setContactLink] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<'loaded' | 'loading' | 'error'>('loading');
  const [error, setError] = useState<Error | undefined>(undefined);

  const [creatingLink, setCreatingLink] = useState(false);

  useEffect(() => {
    if (!contactLink && !creatingLink && profileData?.describes && credentials && credentialsLoaded) {
      // Try to find an invite link record in the VCs.
      const inviteCapability = credentials.find(
        vc => vc['https://schema.org/name'] ?? vc['schema:name'] ?? vc.name === 'Invite Link'
      );

      if (inviteCapability) {
        setContactLink(inviteLinkFromCapUri(inviteCapability.id));
        setStatus('loaded');
      } else {
        setCreatingLink(true);
        createContactCapability(fetchFn, webIdDoc, profileData)
          .then((vcLink: any) => {
            setContactLink(inviteLinkFromCapUri(vcLink));
            setStatus('loaded');
            // Invalidate cache
            queryClient.refetchQueries({
              queryKey: ['VerifiableCredential']
            });
          })
          .catch((error: any) => {
            setStatus('error');
            setContactLink(undefined);
            setError(error);
          });
      }
    }
  }, [profileData, contactLink, credentials, creatingLink, credentialsLoaded]);

  return { contactLink, status, error };
};

export default useContactLink;
