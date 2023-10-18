import { useEffect, useState } from 'react';
import { fetchUtils } from 'react-admin';
import { useWebfinger } from '@semapps/activitypub-components';

const useApplication = appId => {
  const webfinger = useWebfinger();
  const [application, setApplication] = useState();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      if (!loading && !loaded) {
        try {
          setLoading(true);
          const appUri = appId.startsWith('http') ? appId : await webfinger.fetch(appId);
          const { json } = await fetchUtils.fetchJson(appUri);
          setApplication(json);
          setLoaded(true);
          setLoading(false);
        } catch (e) {
          setLoading(false);
        }
      }
    })();
  }, [webfinger, appId, setApplication, loading, setLoading, loaded, setLoaded]);

  return { application, loading, loaded };
};

export default useApplication;
