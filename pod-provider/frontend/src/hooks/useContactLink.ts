import { useState, useEffect } from 'react';
import { useTranslate, useGetIdentity, useGetList } from 'react-admin';

const useContactLink = () => {
  const translate = useTranslate();
  const { data: identity } = useGetIdentity();
  const profileData = identity?.profileData;
  const { data: credentials } = useGetList('VerifiableCredentials');
  const [contactLink, setContactLink] = useState(translate('ra.page.loading'));
  const [status, setStatus] = useState<'loaded' | 'loading' | 'error'>('loading');
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    if (contactLink && profileData?.describes && credentials) {
      const inviteCapability = credentials.find(vc => vc.name === 'Invite Link');
      // vc.type === 'acl:Authorization' && vc['acl:mode'] === 'acl:Read' && vc['acl:accessTo'] === profileData.id;

      if (inviteCapability) {
        setContactLink(`${new URL(window.location.href).origin}/invite/${encodeURIComponent(inviteCapability.id)}`);
      } else {
        // TODO: create invite link.
      }
    }
  }, [profileData, contactLink, credentials]);

  return { contactLink, status, error };
};

export default useContactLink;
