import { FunctionComponent, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDataModels } from '@semapps/semantic-data-provider';
import type { Ontology } from '../types';

const prefix = (uri: string | null, ontologies: [Ontology]) => {
  if (!uri) return;
  if (!uri.startsWith('http')) return uri; // If it is already prefixed
  const ontology = ontologies.find(o => uri.startsWith(o.url));
  return ontology && uri.replace(ontology.url, ontology.prefix + ':');
};

/**
 * Look for the `type` search param and compare it with React-Admin resources
 * Can be a full or a prefixed URI, in which case the component looks in the `ontologies` prop
 * If a matching resource is found, redirect to the resource's list page
 * If a `uri` search param is passed, redirect to the resource's show page
 * If no matching types are found, simply redirect to the homepage
 * This page is called from the data browser in the Pod provider
 */
const RedirectPage: FunctionComponent<Props> = ({ ontologies }) => {
  const dataModels = useDataModels();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (dataModels) {
      const prefixedType = prefix(searchParams.get('type'), ontologies);
      const resource =
        prefixedType &&
        Object.keys(dataModels).find(key => dataModels[key].types && dataModels[key].types.includes(prefixedType));
      if (searchParams.has('uri')) {
        navigate(
          `/${resource}/${encodeURIComponent(searchParams.get('uri') as string)}${
            searchParams.get('mode') === 'show' ? '/show' : ''
          }`
        );
      } else if (resource) {
        navigate(`/${resource}`);
      } else {
        navigate('/');
      }
    }
  }, [dataModels, searchParams, navigate]);

  return null;
};

type Props = {
  ontologies: [Ontology];
};

export default RedirectPage;
