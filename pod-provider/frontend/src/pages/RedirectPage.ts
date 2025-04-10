import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDataProviderConfig, getUriFromPrefix } from '@semapps/semantic-data-provider';

/**
 * Look for the `type` search param and compare it with React-Admin resources
 * Can be a full or a prefixed URI, in which case the component looks in the `ontologies` prop
 * If a matching resource is found, redirect to the resource's list page
 * If a `uri` search param is passed, redirect to the resource's show page
 * If no matching types are found, simply redirect to the homepage
 */
const RedirectPage = () => {
  const config = useDataProviderConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (config) {
      const { ontologies, resources } = config;
      let resourceId;

      if (searchParams.has('type')) {
        const fullTypeUri = getUriFromPrefix(searchParams.get('type'), ontologies);
        resourceId = Object.keys(resources).find(key => resources[key].types?.includes(fullTypeUri));
      }

      if (searchParams.has('uri') && resourceId) {
        navigate(
          `/${resourceId}/${encodeURIComponent(searchParams.get('uri'))}${
            searchParams.get('mode') === 'show' ? '/show' : ''
          }`
        );
      } else if (resourceId) {
        navigate(`/${resourceId}`);
      } else {
        navigate('/');
      }
    }
  }, [config, searchParams, navigate]);

  return null;
};

export default RedirectPage;
