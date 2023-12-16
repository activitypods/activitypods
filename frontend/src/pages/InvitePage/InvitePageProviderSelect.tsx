import React, { useCallback, useMemo } from 'react';
import { Typography } from '@mui/material';
import { useTranslate } from 'react-admin';
import urljoin from 'url-join';

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

  const detailsText = useMemo(
    () =>
      isSignup ? (
        <Typography variant="body2">{translate('app.helper.choose_provider_text_signup')}</Typography>
      ) : (
        // login text
        <Typography variant="body2">{translate('app.helper.choose_provider_text_login')}</Typography>
      ),
    [isSignup]
  );

  const onPodProviderSelected = useCallback((podProviderUrl: string) => {
    // Navigate to pod provider's login page.
    const redirectTo = `/auth?${isSignup ? 'signup=true&' : ``}redirect=${encodeURIComponent(
      `/invite/${encodeURIComponent(capabilityUri)}`
    )}`;
    const url = urljoin(podProviderUrl, redirectTo);
    window.location.href = url;
  }, []);

  return (
    <ChoosePodProviderPage
      detailsText={detailsText}
      customPodProviders={[]}
      onPodProviderSelected={onPodProviderSelected}
      onCancel={onCancel}
    />
  );
};

export default InvitePageProviderSelect;
