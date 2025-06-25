import { useEffect, useState } from 'react';
import { useDataProvider } from 'react-admin';

// Fetch a single resource for which we don't know the type
const useResource = (resourceUri, options = { enabled: true }) => {
  const dataProvider = useDataProvider();
  const [resource, setResource] = useState();
  const [headers, setHeaders] = useState();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      if (resourceUri && options.enabled) {
        try {
          const { json, headers } = await dataProvider.fetch(resourceUri);
          setResource(json);
          setHeaders(headers);
          setIsLoading(false);
          setIsLoaded(true);
        } catch (e) {
          console.error(e);
          setIsLoading(false);
        }
      }
    })();
  }, [resourceUri, options.enabled, dataProvider, setResource, setIsLoading, setIsLoaded]);

  return { data: resource, headers, isLoading, isLoaded };
};

export default useResource;
