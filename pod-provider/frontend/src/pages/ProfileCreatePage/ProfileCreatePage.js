import React, { useEffect } from 'react';
import { useGetIdentity, EditBase, useNotify, useRedirect } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import ProfileCreatePageView from './ProfileCreatePageView';
import ProgressMessage from '../../common/ProgressMessage';
import { isURL, isPath } from '../../utils';

const ProfileCreatePage = () => {
  const notify = useNotify();
  const redirect = useRedirect();
  const { data: identity, refetch: refetchIdentity } = useGetIdentity();
  const [searchParams] = useSearchParams();

  // Reload profile unless profile is created
  useEffect(() => {
    if (!identity?.profileData?.id) {
      const intervalId = setInterval(refetchIdentity, 1000);
      return () => clearInterval(intervalId);
    }
  }, [identity, refetchIdentity]);

  if (!identity?.profileData?.id) return <ProgressMessage message="app.message.pod_creation_progress" />;

  return (
    <EditBase
      resource="Profile"
      id={identity?.profileData?.id}
      mutationMode="pessimistic"
      mutationOptions={{
        onSuccess: () => {
          notify('ra.notification.updated', {
            messageArgs: { smart_count: 1 },
            undoable: false
          });

          refetchIdentity();

          // The redirection URL should be the /.oidc/auth/auth/{interactionId} path of the backend
          // If it is not, this is maybe a phishing attack so we shouldn't use it
          redirect(
            isURL(searchParams.get('redirect')) && searchParams.get('redirect').startsWith(CONFIG.BACKEND_URL)
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
