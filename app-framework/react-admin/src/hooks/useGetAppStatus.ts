import { useCallback } from 'react';
import urlJoin from 'url-join';
import { useGetIdentity } from 'react-admin';
import type { AppStatus } from '../types';

const useGetAppStatus = (): (() => Promise<AppStatus>) => {
  const { data: identity } = useGetIdentity();

  return useCallback(async () => {
    const oidcIssuer = new URL(identity?.id as string).origin;
    const endpointUrl = urlJoin(oidcIssuer, '.well-known/app-status');
    const token = localStorage.getItem('token');

    // Don't use dataProvider.fetch as it would go through the proxy
    const response = await fetch(endpointUrl, {
      headers: new Headers({ Authorization: `Bearer ${token}`, Accept: 'application/json' })
    });

    if (response.ok) {
      return (await response.json()) as AppStatus;
    } else {
      throw new Error(`Unable to fetch app status. Error ${response.status} (${response.statusText})`);
    }
  }, [identity]);
};

export default useGetAppStatus;
