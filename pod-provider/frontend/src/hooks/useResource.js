import { useEffect, useState } from 'react';
import { useDataProvider } from 'react-admin';

// Fetch a single resource for which we don't know the type
const useResource = resourceUri => {
  const dataProvider = useDataProvider();
  const [resource, setResource] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      if (resourceUri) {
        try {
          const { json } = await dataProvider.fetch(resourceUri);
          setResource(json);
          setIsLoading(false);
          setIsLoaded(true);
        } catch (e) {
          console.error(e);
          setIsLoading(false);
        }
      }
    })();
  }, [resourceUri, dataProvider, setResource, setIsLoading, setIsLoaded]);

  return { data: resource, isLoading, isLoaded };
};

export default useResource;
