import React from 'react';
import { useLocation } from 'react-router';
import { Redirect } from 'react-router-dom';
import { useDataModels } from '@semapps/semantic-data-provider';
import ontologies from '../config/ontologies.json';

const prefix = uri => {
  if (!uri.startsWith('http')) return uri; // If it is already prefixed
  const ontology = ontologies.find(o => uri.startsWith(o.url));
  return uri.replace(ontology.url, ontology.prefix + ':');
};

const RedirectPage = () => {
  const dataModels = useDataModels();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  if (dataModels) {
    const prefixedType = prefix(searchParams.get('type'));
    const resource = Object.keys(dataModels).find(key => dataModels[key].types && dataModels[key].types.includes(prefixedType));
    if (searchParams.has('uri')) {
      return <Redirect push to={`/${resource}/${encodeURIComponent(searchParams.get('uri'))}${searchParams.get('mode') === 'show' ? '/show' : ''}`} />;
    } else {
      return <Redirect push to={`/${resource}`} />;
    }
  } else {
    return null;
  }
};

export default RedirectPage;
