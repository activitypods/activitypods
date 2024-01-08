import { useState, useEffect } from 'react';
import { useTranslate, useGetIdentity, useGetList } from 'react-admin';

const useContactLink = () => {
  const translate = useTranslate();
  const { data: identity } = useGetIdentity();
  const profileData = identity?.profileData;
  const { data: caps } = useGetList('Capability');
  const [contactLink, setContactLink] = useState(translate('ra.page.loading'));

  useEffect(() => {
    if (contactLink && profileData?.describes && caps) {
      const inviteCapability = caps.find(
        cap =>
          cap.type === 'acl:Authorization' && cap['acl:mode'] === 'acl:Read' && cap['acl:accessTo'] === profileData.id
      );
      if (inviteCapability) {
        setContactLink(`${new URL(window.location.href).origin}/invite/${encodeURIComponent(inviteCapability.id)}`);
      } else {
        setContactLink(translate('app.notification.invite_cap_missing'));
      }
    }
  }, [profileData, contactLink, caps]);

  return contactLink;
};

export default useContactLink;
