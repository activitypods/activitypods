import { useCallback } from 'react';
import urlJoin from 'url-join';

const useGetAppStatus = () => {
  return useCallback(async (appUri, identity) => {
    if (!identity.id) throw new Error('Identity must be loaded before calling getAppStatus');
    const oidcIssuer = identity?.webIdData?.['solid:oidcIssuer'] || new URL(identity?.id).origin;
    const endpointUrl = new URL(urlJoin(oidcIssuer, '.well-known/app-status'));
    endpointUrl.searchParams.append('appUri', appUri);
    const token = localStorage.getItem('token');

    // Don't use dataProvider.fetch as it would try to go through the proxy
    const response = await fetch(endpointUrl.toString(), {
      headers: new Headers({ Authorization: `Bearer ${token}`, Accept: 'application/json' })
    });

    if (response.ok) {
      return await response.json();
    } else {
      throw new Error(`Unable to fetch ${endpointUrl}`);
    }
  }, []);
};

export default useGetAppStatus;
