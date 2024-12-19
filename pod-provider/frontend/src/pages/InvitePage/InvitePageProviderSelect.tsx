import React, { useCallback } from 'react';
import urlJoin from 'url-join';
import { useTranslate } from 'react-admin';
import ChoosePodProviderPage from '../ChoosePodProviderPage/ChoosePodProviderPage';

/**
 * Renders the ChoosePodProviderPage component.
 * @param {string[]} customPodProviders - An array of custom pod providers.
 * @returns {JSX.Element} The rendered ChoosePodProviderPage component.
 */
const InvitePageProviderSelect: React.FC<{ capabilityUri: string; isSignup: boolean; onCancel: () => void }> = ({
  capabilityUri,
  isSignup,
  onCancel
}) => {
  const translate = useTranslate();

  const onPodProviderSelected = useCallback((podProviderUrl: string) => {
    // Navigate to pod provider's login page.
    const redirectTo = `/auth?${isSignup ? 'signup=true&' : ``}redirect=${encodeURIComponent(
      `/invite/${encodeURIComponent(capabilityUri)}`
    )}`;
    const url = urlJoin(podProviderUrl, redirectTo);
    window.location.href = url;
  }, []);

  return (
    <ChoosePodProviderPage
      detailsText={isSignup ? translate('app.helper.choose_provider_text_signup') : undefined}
      onPodProviderSelected={onPodProviderSelected}
      onCancel={onCancel}
    />
  );
};

export default InvitePageProviderSelect;
