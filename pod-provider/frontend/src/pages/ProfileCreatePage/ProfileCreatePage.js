import React, { useEffect } from 'react';
import { useGetIdentity, EditBase, useNotify, useRedirect } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import ProfileCreatePageView from './ProfileCreatePageView';
import ProgressMessage from '../../common/ProgressMessage';
import { isURL, isPath } from '../../utils';

const getWebIdFromToken = () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return undefined;
    const parts = token.split('.');
    if (parts.length < 2) return undefined;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload?.webId || payload?.webid || payload?.sub || undefined;
  } catch (_error) {
    return undefined;
  }
};

const ProfileCreatePage = () => {
  const notify = useNotify();
  const redirect = useRedirect();
  const { data: identity, refetch: refetchIdentity } = useGetIdentity();
  const [searchParams] = useSearchParams();
  const profileId =
    identity?.profileData?.id ||
    identity?.webId ||
    identity?.id ||
    localStorage.getItem('webId') ||
    getWebIdFromToken();

  // Reload profile unless profile is created
  useEffect(() => {
    if (!profileId) {
      const intervalId = setInterval(refetchIdentity, 1000);
      return () => clearInterval(intervalId);
    }
  }, [profileId, refetchIdentity]);

  if (!profileId) return <ProgressMessage message="app.message.pod_creation_progress" />;

  return (
    <EditBase
      resource="Profile"
      id={profileId}
      mutationMode="pessimistic"
      mutationOptions={{
        onSuccess: () => {
          notify('ra.notification.updated', {
            messageArgs: { smart_count: 1 },
            undoable: false
          });

          refetchIdentity();

          // The redirect query param should be a local path or an URL in the backend (typically /.oidc/auth/auth/{interactionId})
          // If it is not, this is maybe a phishing attack so we shouldn't use it
          redirect(
            isPath(searchParams.get('redirect')) ||
              (isURL(searchParams.get('redirect')) && searchParams.get('redirect').startsWith(CONFIG.BACKEND_URL))
              ? searchParams.get('redirect')
              : '/'
          );
        }
      }}
    >
      <ProfileCreatePageView />
    </EditBase>
  );
};

export default ProfileCreatePage;
