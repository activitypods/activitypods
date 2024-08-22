import { useCallback } from 'react';
import { useGetIdentity } from 'react-admin';
import urlJoin from 'url-join';

const useGetAppStatus = () => {
  const { data: identity } = useGetIdentity();

  return useCallback(
    async appUri => {
      if (identity?.id) {
        // TODO Use solid:oidcIssuer predicate when it will be available
        const oidcIssuer = new URL(identity?.id).origin;
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
      }
    },
    [identity]
  );
};

export default useGetAppStatus;
